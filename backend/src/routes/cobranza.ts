import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { getSaldosPorUnidad } from "../utils/saldos.js";
import { sendBulkEmails } from "../utils/mailer.js";

const router = Router();

function complejo(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({ message: "Complejo no especificado" });
    return null;
  }
  return req.complejoId;
}

// Prioridad por monto adeudado (no por meses, que no son confiables).
function prioridad(saldo: number): "alta" | "media" | "baja" {
  if (saldo >= 500) return "alta";
  if (saldo >= 100) return "media";
  return "baja";
}

// GET /cobranza — worklist de morosos (saldo > 0) priorizada, con contacto y última gestión.
router.get("/", async (req, res) => {
  const idc = complejo(req, res);
  if (!idc) return;

  const [saldos, unidades, cuotas, gestiones] = await Promise.all([
    getSaldosPorUnidad(idc),
    prisma.unidades.findMany({
      where: { id_complejo: idc, activo: true, numero_propiedad: { not: "X01" } },
      select: {
        id: true,
        numero_propiedad: true,
        bloque: true,
        id_estado_unidad: true,
        bloques: { select: { nombre: true } },
        calles: { select: { nombre: true } },
        historial_propietarios: {
          where: { fecha_fin: null },
          include: { propietarios: { select: { nombre: true, apellido: true, telefono: true, email: true } } },
          take: 1,
        },
      },
    }),
    prisma.cuotas.findMany({
      where: { id_complejo: idc, activo: true, periodicidad: "mensual" },
      select: { id_estado_unidad: true, monto: true },
    }),
    // Última gestión por unidad
    prisma.gestiones_cobranza.findMany({
      where: { id_complejo: idc },
      orderBy: { created_at: "desc" },
      select: { id_unidad: true, fecha: true, canal: true, resultado: true, promesa_fecha: true, nota: true },
    }),
  ]);

  const cuotaPorEstado = new Map<string, number>();
  for (const c of cuotas) {
    if (c.id_estado_unidad) cuotaPorEstado.set(c.id_estado_unidad, (cuotaPorEstado.get(c.id_estado_unidad) ?? 0) + c.monto.toNumber());
  }

  // primera gestión encontrada por unidad = la más reciente (ya viene ordenado desc)
  const ultimaGestion = new Map<string, (typeof gestiones)[number]>();
  const ultimaPromesa = new Map<string, { fecha: Date; promesa_fecha: Date }>();
  for (const g of gestiones) {
    if (!ultimaGestion.has(g.id_unidad)) ultimaGestion.set(g.id_unidad, g);
    if (g.resultado === "promesa_pago" && g.promesa_fecha && !ultimaPromesa.has(g.id_unidad)) {
      ultimaPromesa.set(g.id_unidad, { fecha: g.fecha, promesa_fecha: g.promesa_fecha });
    }
  }

  const items = unidades
    .map((u) => {
      const saldo = saldos.get(u.id) ?? 0;
      const prop = u.historial_propietarios[0]?.propietarios;
      const g = ultimaGestion.get(u.id);
      return {
        id_unidad: u.id,
        numero_propiedad: u.numero_propiedad,
        bloque: u.bloques?.nombre ?? u.bloque ?? null,
        calle: u.calles?.nombre ?? null,
        propietario: prop ? `${prop.nombre} ${prop.apellido}` : null,
        telefono: prop?.telefono ?? null,
        email: prop?.email ?? null,
        saldo,
        cuota_mensual: u.id_estado_unidad ? (cuotaPorEstado.get(u.id_estado_unidad) ?? 0) : 0,
        prioridad: prioridad(saldo),
        ultima_gestion: g
          ? { fecha: g.fecha, canal: g.canal, resultado: g.resultado, promesa_fecha: g.promesa_fecha, nota: g.nota }
          : null,
        promesa: ultimaPromesa.get(u.id) ?? null,
      };
    })
    .filter((x) => x.saldo > 0.001)
    .sort((a, b) => b.saldo - a.saldo);

  const totalDeuda = Math.round(items.reduce((s, x) => s + x.saldo, 0) * 100) / 100;

  res.json({
    total_morosos: items.length,
    total_deuda: totalDeuda,
    por_prioridad: {
      alta: items.filter((x) => x.prioridad === "alta").length,
      media: items.filter((x) => x.prioridad === "media").length,
      baja: items.filter((x) => x.prioridad === "baja").length,
    },
    items,
  });
});

// GET /cobranza/resumen — para el dashboard: conteo de gestiones + semáforo de promesas.
router.get("/resumen", async (req, res) => {
  const idc = complejo(req, res);
  if (!idc) return;

  const hoy = new Date();
  const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const hoyKey = hoy.toISOString().slice(0, 10);

  const [saldos, totalGestiones, gestionesMes, ultimasPromesa] = await Promise.all([
    getSaldosPorUnidad(idc),
    prisma.gestiones_cobranza.count({ where: { id_complejo: idc } }),
    prisma.gestiones_cobranza.count({ where: { id_complejo: idc, created_at: { gte: inicioMes } } }),
    prisma.gestiones_cobranza.findMany({
      where: { id_complejo: idc },
      orderBy: { created_at: "desc" },
      select: { id_unidad: true, resultado: true, promesa_fecha: true },
    }),
  ]);

  // Última PROMESA por unidad (aunque después haya otras gestiones). Persiste hasta pagar.
  const promesaPorUnidad = new Map<string, Date>();
  for (const g of ultimasPromesa) {
    if (g.resultado !== "promesa_pago" || !g.promesa_fecha) continue;
    if (!promesaPorUnidad.has(g.id_unidad)) promesaPorUnidad.set(g.id_unidad, g.promesa_fecha);
  }
  let vencidas = 0, hoyCount = 0, proximas = 0;
  for (const [uid, fecha] of promesaPorUnidad) {
    if ((saldos.get(uid) ?? 0) <= 0.001) continue; // ya pagó
    const f = fecha.toISOString().slice(0, 10);
    if (f < hoyKey) vencidas++;
    else if (f === hoyKey) hoyCount++;
    else proximas++;
  }

  res.json({
    total_gestiones: totalGestiones,
    gestiones_mes: gestionesMes,
    promesas: { vencidas, hoy: hoyCount, proximas },
  });
});

// GET /cobranza/gestiones — bitácora global: todas las gestiones (recientes primero).
router.get("/gestiones", async (req, res) => {
  const idc = complejo(req, res);
  if (!idc) return;
  const limit = Math.min(parseInt(req.query.limit as string) || 300, 1000);

  const data = await prisma.gestiones_cobranza.findMany({
    where: { id_complejo: idc },
    orderBy: { created_at: "desc" },
    take: limit,
    include: {
      usuarios: { select: { nombre: true } },
      unidades: {
        select: {
          numero_propiedad: true,
          historial_propietarios: {
            where: { fecha_fin: null },
            include: { propietarios: { select: { nombre: true, apellido: true } } },
            take: 1,
          },
        },
      },
    },
  });

  res.json(
    data.map((g) => {
      const prop = g.unidades?.historial_propietarios[0]?.propietarios;
      return {
        id: g.id,
        id_unidad: g.id_unidad,
        numero_propiedad: g.unidades?.numero_propiedad ?? g.id_unidad,
        propietario: prop ? `${prop.nombre} ${prop.apellido}` : null,
        fecha: g.fecha,
        canal: g.canal,
        resultado: g.resultado,
        promesa_fecha: g.promesa_fecha,
        nota: g.nota,
        saldo_al_momento: g.saldo_al_momento,
        registrado_por: g.usuarios?.nombre ?? null,
        created_at: g.created_at,
      };
    })
  );
});

// POST /cobranza/gestion — registra un contacto de cobranza.
router.post("/gestion", async (req, res) => {
  const idc = complejo(req, res);
  if (!idc) return;

  const { id_unidad, canal, resultado, promesa_fecha, nota, saldo_al_momento } = req.body ?? {};
  const CANALES = ["llamada", "whatsapp", "email", "visita", "otro"];
  const RESULTADOS = ["contactado", "promesa_pago", "sin_respuesta", "numero_erroneo", "mensaje_enviado", "otro"];
  if (!id_unidad) return res.status(400).json({ message: "id_unidad es requerido" });
  if (!CANALES.includes(canal)) return res.status(400).json({ message: "canal inválido" });
  if (!RESULTADOS.includes(resultado)) return res.status(400).json({ message: "resultado inválido" });

  const unidad = await prisma.unidades.findFirst({ where: { id: id_unidad, id_complejo: idc }, select: { id: true } });
  if (!unidad) return res.status(404).json({ message: "Unidad no encontrada" });

  const g = await prisma.gestiones_cobranza.create({
    data: {
      id_complejo: idc,
      id_unidad,
      canal,
      resultado,
      promesa_fecha: promesa_fecha ? new Date(promesa_fecha) : null,
      nota: nota?.trim() || null,
      saldo_al_momento: saldo_al_momento != null ? Number(saldo_al_momento) : null,
      registrado_por: req.user?.sub ?? null,
    },
  });
  res.status(201).json({ id: g.id });
});

// POST /cobranza/email — envía un correo de cobranza a la unidad (usa el SMTP de la empresa)
// y registra la gestión. El "de" es el remitente configurado en Configuración → Email.
router.post("/email", async (req, res) => {
  const idc = complejo(req, res);
  if (!idc) return;

  const { id_unidad, to, asunto, cuerpo, saldo_al_momento, guardar_email } = req.body ?? {};
  if (!id_unidad) return res.status(400).json({ message: "id_unidad es requerido" });
  if (!to || !/.+@.+\..+/.test(String(to))) return res.status(400).json({ message: "Correo de destino inválido" });
  if (!cuerpo?.trim()) return res.status(400).json({ message: "El cuerpo del correo es requerido" });

  const unidad = await prisma.unidades.findFirst({
    where: { id: id_unidad, id_complejo: idc },
    select: { id: true, historial_propietarios: { where: { fecha_fin: null }, select: { id_propietario: true }, take: 1 } },
  });
  if (!unidad) return res.status(404).json({ message: "Unidad no encontrada" });

  const asuntoFinal = asunto?.trim() || "Recordatorio de pago";
  const html = `<div style="font-family:sans-serif;line-height:1.6">${String(cuerpo).trim().replace(/\n/g, "<br>")}</div>`;

  const result = await sendBulkEmails(idc, [{ to: String(to).trim(), subject: asuntoFinal, html }]);
  if (!result.configured) {
    return res.status(400).json({ message: "No hay correo (SMTP) configurado. Configúralo en Configuración → Email." });
  }
  if (result.sent === 0) {
    return res.status(400).json({ message: "No se pudo enviar el correo. Revisa la configuración SMTP." });
  }

  // Guardar el correo en la ficha del propietario (mantener la base al día).
  let guardado = false;
  const idProp = unidad.historial_propietarios[0]?.id_propietario;
  if (guardar_email && idProp) {
    await prisma.propietarios.update({ where: { id: idProp }, data: { email: String(to).trim() } });
    guardado = true;
  }

  await prisma.gestiones_cobranza.create({
    data: {
      id_complejo: idc,
      id_unidad,
      canal: "email",
      resultado: "mensaje_enviado",
      nota: `Correo enviado: ${asuntoFinal}`,
      saldo_al_momento: saldo_al_momento != null ? Number(saldo_al_momento) : null,
      registrado_por: req.user?.sub ?? null,
    },
  });

  res.json({ ok: true, message: `Correo enviado a ${to}`, email_guardado: guardado });
});

// GET /cobranza/:idUnidad/gestiones — historial de gestiones de una unidad.
router.get("/:idUnidad/gestiones", async (req, res) => {
  const idc = complejo(req, res);
  if (!idc) return;
  const data = await prisma.gestiones_cobranza.findMany({
    where: { id_complejo: idc, id_unidad: req.params.idUnidad },
    orderBy: { created_at: "desc" },
    include: { usuarios: { select: { nombre: true } } },
  });
  res.json(
    data.map((g) => ({
      id: g.id,
      fecha: g.fecha,
      canal: g.canal,
      resultado: g.resultado,
      promesa_fecha: g.promesa_fecha,
      nota: g.nota,
      saldo_al_momento: g.saldo_al_momento,
      registrado_por: g.usuarios?.nombre ?? null,
      created_at: g.created_at,
    }))
  );
});

export default router;
