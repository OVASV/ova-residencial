import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { sendBulkEmails, type EmailPayload } from "../utils/mailer.js";
import { sendBulkWhatsAppTemplate } from "../utils/whatsapp.js";
import { saldosPorUnidadDesde, calcularMora } from "../utils/saldos.js";
import { generarEstadoCuentaHtml } from "../utils/estadoCuentaHtml.js";

const router = Router();
const puedeAvisar = requireRole("admin", "superadmin", "directiva");

// Meses de mora aproximados a partir del monto (informativo). No se usa para el
// valor de mora; solo para la columna/variable {meses_mora}.
function mesesMoraAprox(saldo: number, cuota: number): number {
  if (saldo <= 0.001) return 0;
  if (cuota <= 0) return 1;
  return Math.round(saldo / cuota);
}

const TIPOS = ["recordatorio_pago", "aviso_mora", "mantenimiento", "reunion", "general"];
const CANALES = ["whatsapp", "email", "ambos"];
const FILTROS = ["todos", "pendientes", "atrasados", "unidad"];

function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({ message: "Complejo no especificado (superadmin: enviar header X-Complejo-ID)" });
    return null;
  }
  return req.complejoId;
}

interface Destinatario {
  id_unidad: string;
  numero_propiedad: string | null;
  id_propietario: string | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  area: number | null;
  saldo: number;
  meses_mora: number;
  total_mora: number;
  cuota_mensual: number;
}

// Resuelve los destinatarios desde la BD según el filtro (sección 7.8).
async function resolverDestinatarios(
  idComplejo: string,
  filtro: string,
  idUnidad?: string
): Promise<Destinatario[]> {
  const inicioMes = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const [unidades, cargos, pagos, cuotas] = await Promise.all([
    prisma.unidades.findMany({
      where: { id_complejo: idComplejo, activo: true },
      include: {
        historial_propietarios: {
          where: { fecha_fin: null },
          include: { propietarios: { select: { id: true, nombre: true, apellido: true, email: true, telefono: true } } },
        },
      },
    }),
    prisma.cargos.findMany({
      where: { id_complejo: idComplejo, estado: { not: "anulado" } },
      select: { id_unidad: true, monto: true, periodo_mes: true },
      orderBy: { periodo_mes: "asc" },
    }),
    prisma.pagos.findMany({
      where: { id_complejo: idComplejo, estado: { not: "anulado" } },
      select: { id_unidad: true, monto_total: true },
    }),
    prisma.cuotas.findMany({
      where: { id_complejo: idComplejo, activo: true, periodicidad: "mensual" },
      select: { id_estado_unidad: true, monto: true },
    }),
  ]);

  const cuotaPorEstado = new Map<string, number>();
  for (const c of cuotas) {
    if (c.id_estado_unidad) {
      cuotaPorEstado.set(c.id_estado_unidad, (cuotaPorEstado.get(c.id_estado_unidad) ?? 0) + c.monto.toNumber());
    }
  }

  // Saldo real por unidad = Σ cargos − Σ pagos (fuente única en saldos.ts).
  // La mora (lo que debe) = ese saldo sin bajar de 0. No depende de meses.
  const saldoPorUnidad = saldosPorUnidadDesde(
    cargos.map((c) => ({ id_unidad: c.id_unidad, monto: c.monto.toNumber() })),
    pagos.map((p) => ({ id_unidad: p.id_unidad, monto: p.monto_total.toNumber() }))
  );

  const todos: Destinatario[] = unidades
    .filter((u) => u.historial_propietarios[0]?.propietarios)
    .map((u) => {
      const p = u.historial_propietarios[0].propietarios!;
      return {
        id_unidad: u.id,
        numero_propiedad: u.numero_propiedad,
        id_propietario: p.id,
        nombre: `${p.nombre} ${p.apellido}`,
        email: p.email,
        telefono: p.telefono,
        area: u.area_m2 ? Number(u.area_m2) : null,
        saldo: saldoPorUnidad.get(u.id) ?? 0,
        meses_mora: mesesMoraAprox(saldoPorUnidad.get(u.id) ?? 0, u.id_estado_unidad ? (cuotaPorEstado.get(u.id_estado_unidad) ?? 0) : 0),
        total_mora: calcularMora(saldoPorUnidad.get(u.id) ?? 0),
        cuota_mensual: u.id_estado_unidad ? (cuotaPorEstado.get(u.id_estado_unidad) ?? 0) : 0,
      };
    });

  switch (filtro) {
    case "pendientes":
      // Debe algo pero no más de una mensualidad (al día / mes en curso)
      return todos.filter((d) => d.saldo > 0 && (d.cuota_mensual <= 0 || d.saldo <= d.cuota_mensual + 0.001));
    case "atrasados":
      // Debe más de una mensualidad
      return todos.filter((d) => d.cuota_mensual > 0 && d.saldo > d.cuota_mensual + 0.001);
    case "unidad":
      return todos.filter((d) => d.id_unidad === idUnidad);
    default:
      return todos;
  }
}

// GET /avisos/destinatarios?filtro=&id_unidad= — preview/conteo de destinatarios.
router.get("/destinatarios", async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const filtro = (req.query.filtro as string) || "todos";
  if (!FILTROS.includes(filtro)) return res.status(400).json({ message: "filtro inválido" });
  const data = await resolverDestinatarios(idc, filtro, req.query.id_unidad as string);
  res.json({ total: data.length, destinatarios: data });
});

// GET /avisos — historial + estadísticas.
router.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  const data = await prisma.avisos.findMany({ where, orderBy: { created_at: "desc" } });

  const enviados = data.filter((a) => a.estado === "enviado");
  const totEnvios = enviados.reduce((s, a) => s + a.total_envios, 0);
  const totEntregados = enviados.reduce((s, a) => s + a.total_entregados, 0);
  const totAbiertos = enviados.reduce((s, a) => s + a.total_abiertos, 0);

  res.json({
    stats: {
      total_enviados: totEnvios,
      tasa_entrega: totEnvios > 0 ? Math.round((totEntregados / totEnvios) * 100) : 0,
      tasa_apertura: totEnvios > 0 ? Math.round((totAbiertos / totEnvios) * 100) : 0,
    },
    avisos: data.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      asunto: a.asunto,
      mensaje: a.mensaje,
      canal: a.canal,
      estado: a.estado,
      total_envios: a.total_envios,
      total_entregados: a.total_entregados,
      total_abiertos: a.total_abiertos,
      programado_at: a.programado_at,
      enviado_at: a.enviado_at,
      created_at: a.created_at,
    })),
  });
});

// GET /avisos/:id — detalle con destinatarios.
router.get("/:id", async (req, res) => {
  const a = await prisma.avisos.findUnique({ where: { id: req.params.id } });
  if (!a || (req.complejoId && a.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Aviso no encontrado" });
  }
  res.json({ ...a, destinatarios: a.destinatarios ? JSON.parse(a.destinatarios) : [] });
});

// POST /avisos — crea y registra el aviso (envío inmediato o programado).
// El despacho real por email/WhatsApp requiere integración (pendiente de credenciales).
router.post("/", puedeAvisar, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { tipo, asunto, mensaje, canal, filtro, id_unidad, id_unidades, programado_at, guardar_borrador, incluir_estado_cuenta } = req.body ?? {};

  if (!TIPOS.includes(tipo)) return res.status(400).json({ message: "tipo inválido" });
  if (!CANALES.includes(canal)) return res.status(400).json({ message: "canal inválido" });
  if (!FILTROS.includes(filtro)) return res.status(400).json({ message: "filtro inválido" });
  if (!mensaje?.trim()) return res.status(400).json({ message: "mensaje es requerido" });

  const complejo = await prisma.complejos.findUnique({ where: { id: idc }, select: { nombre: true } });
  const complejoNombre = complejo?.nombre ?? "Residencial";

  let destinatarios = await resolverDestinatarios(idc, filtro, id_unidad);
  if (Array.isArray(id_unidades) && id_unidades.length > 0) {
    const allowed = new Set(id_unidades as string[]);
    destinatarios = destinatarios.filter((d: Destinatario) => allowed.has(d.id_unidad));
  }
  if (!guardar_borrador && destinatarios.length === 0) {
    return res.status(400).json({ message: "No hay destinatarios para el filtro seleccionado" });
  }

  const programado = programado_at ? new Date(programado_at) : null;
  const estado = guardar_borrador ? "borrador" : programado && programado > new Date() ? "programado" : "enviado";

  const aviso = await prisma.avisos.create({
    data: {
      id_complejo: idc,
      tipo,
      asunto: asunto?.trim() || null,
      mensaje: mensaje.trim(),
      canal,
      destinatarios: JSON.stringify(destinatarios),
      total_envios: estado === "enviado" ? destinatarios.length : 0,
      total_entregados: 0, // se actualizará cuando se integre el canal real
      total_abiertos: 0,
      estado,
      programado_at: programado,
      enviado_at: estado === "enviado" ? new Date() : null,
      creado_por: req.user?.sub ?? null,
    },
  });

  // Send emails if estado is "enviado" and canal includes email
  let emailResult = { sent: 0, failed: 0 };
  if (estado === "enviado" && (canal === "email" || canal === "ambos")) {
    const conEmail = destinatarios.filter((d: Destinatario) => d.email);

    // Pre-generate estado de cuenta HTML per unit if requested
    const ecCache = new Map<string, string>();
    if (incluir_estado_cuenta) {
      const unitIds = [...new Set(conEmail.map((d: Destinatario) => d.id_unidad))];
      await Promise.all(unitIds.map(async (uid) => {
        const ec = await generarEstadoCuentaHtml(uid);
        if (ec) ecCache.set(uid, ec.html);
      }));
    }

    const now = new Date();
    const mesNombre = (() => { const s = now.toLocaleDateString("es", { month: "long" }); return s.charAt(0).toUpperCase() + s.slice(1); })();
    // Formato de moneda sin símbolo: 2,800.00
    const fmtMonto = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Reemplaza las variables {..} por los datos del destinatario (aplica a cuerpo y asunto).
    const aplicarVars = (texto: string, d: Destinatario) => texto
      .replace(/\{nombre\}/g, d.nombre)
      .replace(/\{mes_nombre\}/g, mesNombre)
      .replace(/\{mes_anio\}/g, String(now.getFullYear()))
      .replace(/\{monto\}/g, fmtMonto(d.saldo))
      .replace(/\{meses_mora\}/g, String(d.meses_mora))
      .replace(/\{monto_total\}/g, fmtMonto(d.saldo))
      .replace(/\{total_mora\}/g, fmtMonto(d.total_mora))
      .replace(/\{cuota\}/g, fmtMonto(d.cuota_mensual))
      .replace(/\{area\}/g, d.area != null ? `${d.area} m²` : "");

    const emails: EmailPayload[] = conEmail.map((d: Destinatario) => {
      let html = `<div style="font-family:sans-serif;line-height:1.6">${aplicarVars(mensaje.trim(), d).replace(/\n/g, "<br>")}</div>`;

      const ec = ecCache.get(d.id_unidad);
      if (ec) {
        html += `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">` + ec;
      }

      return {
        to: d.email!,
        subject: asunto?.trim() ? aplicarVars(asunto.trim(), d) : `Aviso — ${complejoNombre}`,
        html,
      };
    });

    emailResult = await sendBulkEmails(idc, emails);
  }

  // Despacho por WhatsApp (Cloud API con plantilla aprobada)
  let waResult = { sent: 0, failed: 0, configured: true, soportado: true };
  if (estado === "enviado" && (canal === "whatsapp" || canal === "ambos")) {
    const conTel = destinatarios.filter((d: Destinatario) => d.telefono);
    waResult = await sendBulkWhatsAppTemplate(
      idc,
      tipo,
      conTel.map((d: Destinatario) => ({
        nombre: d.nombre,
        telefono: d.telefono,
        saldo: d.saldo,
        cuota_mensual: d.cuota_mensual,
        meses_mora: d.meses_mora,
      }))
    );
  }

  // Contadores combinados
  if (estado === "enviado") {
    await prisma.avisos.update({
      where: { id: aviso.id },
      data: {
        total_envios: destinatarios.length,
        total_entregados: emailResult.sent + waResult.sent,
      },
    });
  }

  res.status(201).json({ ...aviso, destinatarios, emailResult, waResult });
});

export default router;
