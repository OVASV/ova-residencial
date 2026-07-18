import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { upload, tipoComprobante, borrarArchivo } from "../upload.js";
import { estaPeriodoCerrado, periodoDeFecha, PERIODO_CERRADO_MSG } from "../utils/cierres.js";

const router = Router();
const soloAdmin = requireRole("admin", "superadmin");

function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({
      message: "Complejo no especificado (superadmin: enviar header X-Complejo-ID)",
    });
    return null;
  }
  return req.complejoId;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ================================ LISTAR ================================ */

// GET /pagos?id_unidad=&periodo=YYYY-MM
router.get("/", async (req, res) => {
  const { id_unidad, periodo } = req.query as { id_unidad?: string; periodo?: string };
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  if (id_unidad) where.id_unidad = id_unidad;
  if (periodo) {
    const m = /^(\d{4})-(\d{2})$/.exec(periodo);
    if (!m) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });
    const y = Number(m[1]);
    const mes = Number(m[2]);
    where.fecha_pago = {
      gte: new Date(Date.UTC(y, mes - 1, 1)),
      lt: new Date(Date.UTC(y, mes, 1)),
    };
  }
  const data = await prisma.pagos.findMany({
    where,
    orderBy: { fecha_pago: "desc" },
    include: { pago_cargos: { include: { cargos: { select: { concepto: true, periodo_mes: true } } } } },
  });
  res.json(data);
});

// GET /pagos/recibos — listado de pagos con datos de unidad y propietario.
router.get("/recibos", async (req, res) => {
  const where: Record<string, unknown> = { estado: { not: "anulado" } };
  if (req.complejoId) where.id_complejo = req.complejoId;

  // Recibos específicos por id (para ver/imprimir un recibo suelto).
  const idsParam = (req.query.ids as string | undefined)?.split(",").map((s) => s.trim()).filter(Boolean);
  let periodoAplicado: { anio: number; mes: number } | null = null;

  if (idsParam && idsParam.length > 0) {
    where.id = { in: idsParam };
  } else {
  // Filtro por año/mes (sobre fecha_pago) para no traer todo el historial.
  // Sin año: por defecto el último mes con pagos (no el mes calendario, que puede estar vacío).
  let anio = parseInt(req.query.anio as string);
  let mes = parseInt(req.query.mes as string);
  const tieneAnio = Number.isInteger(anio) && anio > 2000;
  const tieneMes = Number.isInteger(mes) && mes >= 1 && mes <= 12;

  if (!tieneAnio && req.query.anio === undefined && req.query.mes === undefined) {
    // Default: mes actual (aunque no haya recibos)
    const hoy = new Date();
    anio = hoy.getUTCFullYear();
    mes = hoy.getUTCMonth() + 1;
    where.fecha_pago = { gte: new Date(Date.UTC(anio, mes - 1, 1)), lt: new Date(Date.UTC(anio, mes, 1)) };
    periodoAplicado = { anio, mes };
  } else if (tieneAnio) {
    const desde = tieneMes ? new Date(Date.UTC(anio, mes - 1, 1)) : new Date(Date.UTC(anio, 0, 1));
    const hasta = tieneMes ? new Date(Date.UTC(anio, mes, 1)) : new Date(Date.UTC(anio + 1, 0, 1));
    where.fecha_pago = { gte: desde, lt: hasta };
    periodoAplicado = { anio, mes: tieneMes ? mes : 0 };
  }
  }
  const data = await prisma.pagos.findMany({
    where,
    orderBy: { fecha_pago: "desc" },
    include: {
      pago_cargos: { include: { cargos: { select: { concepto: true, periodo_mes: true, monto: true } } } },
      traslados_pago: { select: { justificacion: true, id_unidad_origen: true, monto_total: true } },
      unidades: {
        select: {
          numero_propiedad: true,
          bloque: true,
          bloques: { select: { nombre: true } },
          calles: { select: { nombre: true } },
          id_estado_unidad: true,
        },
      },
    },
  });

  const complejoId = req.complejoId;
  const [cuotas, complejo] = await Promise.all([
    complejoId
      ? prisma.cuotas.findMany({ where: { id_complejo: complejoId, activo: true }, select: { monto: true, id_estado_unidad: true, concepto: true } })
      : Promise.resolve([]),
    complejoId
      ? prisma.complejos.findUnique({ where: { id: complejoId }, select: { nombre: true, logo_url: true } })
      : Promise.resolve(null),
  ]);

  const result = await Promise.all(data.map(async (p) => {
    const hist = await prisma.historial_propietarios.findFirst({
      where: { id_unidad: p.id_unidad, fecha_fin: null },
      include: { propietarios: { select: { nombre: true, apellido: true } } },
    });

    const cuotaUnidad = cuotas.find((c) => c.id_estado_unidad === p.unidades?.id_estado_unidad);
    const traslado = p.traslados_pago.length > 0 ? p.traslados_pago[0] : null;
    const estadoUnidad = cuotaUnidad && p.unidades?.id_estado_unidad
      ? await prisma.estados_unidad.findUnique({ where: { id: p.unidades.id_estado_unidad }, select: { nombre: true } })
      : null;

    return {
      id: p.id,
      fecha_pago: p.fecha_pago,
      monto_total: p.monto_total,
      metodo: p.metodo,
      banco_origen: p.banco_origen,
      referencia_banco: p.referencia_banco,
      estado: p.estado,
      numero_propiedad: p.unidades?.numero_propiedad ?? null,
      bloque: p.unidades?.bloques?.nombre ?? p.unidades?.bloque ?? null,
      calle: p.unidades?.calles?.nombre ?? null,
      propietario: hist ? `${hist.propietarios.nombre} ${hist.propietarios.apellido}` : null,
      conceptos: p.pago_cargos.map((pc) => pc.cargos.concepto).join(", "),
      cuota_asignada: cuotaUnidad ? { concepto: cuotaUnidad.concepto, monto: cuotaUnidad.monto, tipo_propiedad: estadoUnidad?.nombre ?? null } : null,
      justificacion_traslado: traslado?.justificacion ?? null,
      pago_cargos: p.pago_cargos.map((pc) => ({
        concepto: pc.cargos.concepto,
        periodo_mes: pc.cargos.periodo_mes,
        monto_aplicado: pc.monto_aplicado,
        monto_cargo: pc.cargos.monto,
      })),
    };
  }));
  res.json({ nombre_complejo: complejo?.nombre ?? null, logo_url: complejo?.logo_url ?? null, periodo: periodoAplicado, recibos: result });
});

// GET /pagos/:id — detalle con cargos saldados.
router.get("/:id", async (req, res) => {
  const pago = await prisma.pagos.findUnique({
    where: { id: req.params.id },
    include: { pago_cargos: { include: { cargos: true } } },
  });
  if (!pago || (req.complejoId && pago.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Pago no encontrado" });
  }
  res.json(pago);
});

/* =============================== REGISTRAR =============================== */

// POST /pagos
// body: { id_unidad, fecha_pago, metodo, monto_total?, banco_origen?, referencia_banco?,
//         comprobante_*?, aplicaciones?: [{ id_cargo, monto_aplicado? }] }
// aplicaciones es opcional: si se omite se registra un pago libre (adelanto o sin identificar).
// Si monto_aplicado se omite, salda el saldo completo del cargo.
router.post("/", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const {
    id_unidad,
    fecha_pago,
    metodo,
    monto_total: montoLibre,
    banco_origen,
    referencia_banco,
    comprobante_url,
    comprobante_nombre,
    comprobante_tipo,
    aplicaciones,
  } = req.body ?? {};

  if (!id_unidad || !fecha_pago || !metodo) {
    return res.status(400).json({ message: "id_unidad, fecha_pago y metodo son requeridos" });
  }
  if (!["transferencia", "efectivo", "cheque"].includes(metodo)) {
    return res.status(400).json({ message: "metodo inválido" });
  }
  if (metodo !== "efectivo" && !referencia_banco) {
    return res.status(400).json({ message: "transferencia y cheque requieren referencia_banco" });
  }
  if (await estaPeriodoCerrado(idc, periodoDeFecha(new Date(fecha_pago)))) {
    return res.status(403).json({ message: PERIODO_CERRADO_MSG });
  }

  const unidad = await prisma.unidades.findUnique({ where: { id: id_unidad } });
  if (!unidad || unidad.id_complejo !== idc) {
    return res.status(404).json({ message: "Unidad no encontrada en este complejo" });
  }

  const tieneAplicaciones = Array.isArray(aplicaciones) && aplicaciones.length > 0;

  // Pago sin aplicaciones explícitas: aplica automáticamente a cargos pendientes
  // más antiguos de la unidad hasta agotar el monto.
  if (!tieneAplicaciones) {
    const monto = Number(montoLibre);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ message: "monto_total es requerido cuando no se aplican cargos" });
    }

    const pendientes = await prisma.cargos.findMany({
      where: { id_unidad, id_complejo: idc, estado: { in: ["pendiente", "parcial"] } },
      orderBy: [{ periodo_mes: "asc" }, { concepto: "asc" }],
    });

    const autoDetalle: { id_cargo: string; monto: number; saldoActual: number }[] = [];
    let restante = r2(monto);
    for (const c of pendientes) {
      if (restante <= 0) break;
      const saldoActual = c.saldo.toNumber();
      const aplicar = r2(Math.min(restante, saldoActual));
      autoDetalle.push({ id_cargo: c.id, monto: aplicar, saldoActual });
      restante = r2(restante - aplicar);
    }

    const pago = await prisma.$transaction(async (tx) => {
      const p = await tx.pagos.create({
        data: {
          id_complejo: idc,
          id_unidad,
          fecha_pago: new Date(fecha_pago),
          monto_total: r2(monto),
          metodo,
          banco_origen: banco_origen || null,
          referencia_banco: referencia_banco || null,
          comprobante_url: comprobante_url || null,
          comprobante_nombre: comprobante_nombre || null,
          comprobante_tipo: comprobante_tipo || null,
          estado: "registrado",
          registrado_por: req.user?.sub ?? null,
        },
      });
      for (const d of autoDetalle) {
        await tx.pago_cargos.create({
          data: { id_pago: p.id, id_cargo: d.id_cargo, monto_aplicado: d.monto },
        });
        const nuevoSaldo = r2(d.saldoActual - d.monto);
        await tx.cargos.update({
          where: { id: d.id_cargo },
          data: { saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? "pagado" : "parcial" },
        });
      }
      return p;
    });
    return res.status(201).json({ ...pago, cargos_saldados: autoDetalle.length });
  }

  // Validar cargos y calcular montos a aplicar.
  const ids = aplicaciones.map((a: { id_cargo: string }) => a.id_cargo);
  const cargos = await prisma.cargos.findMany({ where: { id: { in: ids } } });
  const porId = new Map(cargos.map((c) => [c.id, c]));

  const detalle: { id_cargo: string; monto: number; saldoActual: number }[] = [];
  for (const a of aplicaciones as { id_cargo: string; monto_aplicado?: number }[]) {
    const cargo = porId.get(a.id_cargo);
    if (!cargo || cargo.id_complejo !== idc || cargo.id_unidad !== id_unidad) {
      return res.status(400).json({ message: `Cargo inválido: ${a.id_cargo}` });
    }
    if (cargo.estado === "anulado") {
      return res.status(400).json({ message: `Cargo anulado: ${a.id_cargo}` });
    }
    const saldoActual = cargo.saldo.toNumber();
    const monto = a.monto_aplicado != null ? Number(a.monto_aplicado) : saldoActual;
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ message: `monto_aplicado inválido para ${a.id_cargo}` });
    }
    if (monto > saldoActual + 0.001) {
      return res.status(400).json({
        message: `monto_aplicado (${monto}) excede el saldo (${saldoActual}) del cargo ${a.id_cargo}`,
      });
    }
    detalle.push({ id_cargo: cargo.id, monto: r2(monto), saldoActual });
  }

  const montoTotal = r2(detalle.reduce((s, d) => s + d.monto, 0));
  if (montoTotal <= 0) return res.status(400).json({ message: "El monto total debe ser mayor a 0" });

  const pago = await prisma.$transaction(async (tx) => {
    const p = await tx.pagos.create({
      data: {
        id_complejo: idc,
        id_unidad,
        fecha_pago: new Date(fecha_pago),
        monto_total: montoTotal,
        metodo,
        banco_origen: banco_origen || null,
        referencia_banco: referencia_banco || null,
        comprobante_url: comprobante_url || null,
        comprobante_nombre: comprobante_nombre || null,
        comprobante_tipo: comprobante_tipo || null,
        estado: "registrado",
        registrado_por: req.user?.sub ?? null,
      },
    });
    for (const d of detalle) {
      await tx.pago_cargos.create({
        data: { id_pago: p.id, id_cargo: d.id_cargo, monto_aplicado: d.monto },
      });
      const nuevoSaldo = r2(d.saldoActual - d.monto);
      await tx.cargos.update({
        where: { id: d.id_cargo },
        data: { saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? "pagado" : "parcial" },
      });
    }
    return p;
  });

  res.status(201).json({ ...pago, cargos_saldados: detalle.length });
});

// PATCH /pagos/:id/anular — revierte el pago y restaura los saldos.
router.patch("/:id/anular", soloAdmin, async (req, res) => {
  const pago = await prisma.pagos.findUnique({
    where: { id: req.params.id },
    include: { pago_cargos: { include: { cargos: true } } },
  });
  if (!pago || (req.complejoId && pago.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Pago no encontrado" });
  }
  if (pago.estado === "anulado") {
    return res.status(409).json({ message: "El pago ya está anulado" });
  }
  if (await estaPeriodoCerrado(pago.id_complejo, periodoDeFecha(pago.fecha_pago))) {
    return res.status(403).json({ message: PERIODO_CERRADO_MSG });
  }

  await prisma.$transaction(async (tx) => {
    for (const pc of pago.pago_cargos) {
      const cargo = pc.cargos;
      const restaurado = r2(cargo.saldo.toNumber() + pc.monto_aplicado.toNumber());
      const monto = cargo.monto.toNumber();
      await tx.cargos.update({
        where: { id: cargo.id },
        data: {
          saldo: restaurado,
          estado: restaurado >= monto ? "pendiente" : "parcial",
        },
      });
    }
    await tx.pagos.update({ where: { id: pago.id }, data: { estado: "anulado" } });
  });

  res.json({ message: "Pago anulado", id: pago.id });
});

/* ============================ COMPROBANTE ============================ */

// POST /pagos/:id/comprobante — adjunta imagen/PDF (multipart, campo "archivo").
router.post("/:id/comprobante", soloAdmin, upload.single("archivo"), async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) {
    if (req.file) borrarArchivo(`/uploads/${req.file.filename}`);
    return;
  }
  if (!req.file) return res.status(400).json({ message: "archivo requerido" });
  const pago = await prisma.pagos.findUnique({ where: { id: req.params.id } });
  if (!pago || pago.id_complejo !== idc) {
    borrarArchivo(`/uploads/${req.file.filename}`);
    return res.status(404).json({ message: "Pago no encontrado" });
  }
  borrarArchivo(pago.comprobante_url); // reemplaza el anterior si existía
  const updated = await prisma.pagos.update({
    where: { id: pago.id },
    data: {
      comprobante_url: `/uploads/${req.file.filename}`,
      comprobante_nombre: req.file.originalname,
      comprobante_tipo: tipoComprobante(req.file.mimetype),
    },
  });
  res.json(updated);
});

// DELETE /pagos/:id/comprobante — quita el comprobante.
router.delete("/:id/comprobante", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const pago = await prisma.pagos.findUnique({ where: { id: req.params.id } });
  if (!pago || pago.id_complejo !== idc) return res.status(404).json({ message: "Pago no encontrado" });
  borrarArchivo(pago.comprobante_url);
  const updated = await prisma.pagos.update({
    where: { id: pago.id },
    data: { comprobante_url: null, comprobante_nombre: null, comprobante_tipo: null },
  });
  res.json(updated);
});

export default router;
