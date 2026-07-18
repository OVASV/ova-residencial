import { Router } from "express";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
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

// 'YYYY-MM' -> primer día del mes (UTC). Devuelve null si el formato es inválido.
function periodoToDate(periodo: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(y, mes - 1, 1));
}

/* ================================ LISTAR ================================ */

// GET /cargos?periodo=YYYY-MM&id_unidad=&estado=
router.get("/", async (req, res) => {
  const { periodo, id_unidad, estado } = req.query as {
    periodo?: string;
    id_unidad?: string;
    estado?: string;
  };
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  if (id_unidad) where.id_unidad = id_unidad;
  if (estado) where.estado = estado;
  if (periodo) {
    const d = periodoToDate(periodo);
    if (!d) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });
    where.periodo_mes = d;
  }

  const data = await prisma.cargos.findMany({
    where,
    orderBy: [{ id_unidad: "asc" }, { concepto: "asc" }],
  });
  res.json(data);
});

// GET /cargos/pendientes?id_unidad=  — cargos con saldo > 0 (cualquier período).
router.get("/pendientes", async (req, res) => {
  const { id_unidad } = req.query as { id_unidad?: string };
  if (!id_unidad) return res.status(400).json({ message: "id_unidad es requerido" });
  const where: Record<string, unknown> = {
    id_unidad,
    estado: { not: "anulado" },
    saldo: { gt: 0 },
  };
  if (req.complejoId) where.id_complejo = req.complejoId;
  const data = await prisma.cargos.findMany({
    where,
    orderBy: [{ periodo_mes: "asc" }, { concepto: "asc" }],
  });
  res.json(data);
});

/* ============================== GENERAR MES ============================== */

// POST /cargos/generar { periodo: 'YYYY-MM' }
// Crea los cargos FIJOS con aplica_auto del período: mantenimiento según la
// categoría de cada unidad + conceptos generales (id_estado_unidad NULL).
// Idempotente: omite los que ya existen (unique id_unidad+periodo+concepto).
// Los conceptos variables (p. ej. Agua) NO se generan aquí: se agregan por
// unidad con POST /cargos cuando se conoce el monto.
router.post("/generar", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const periodoMes = periodoToDate(req.body?.periodo);
  if (!periodoMes) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });
  // El preview es solo lectura; el cierre solo bloquea la generación real.
  if (!req.body?.preview && (await estaPeriodoCerrado(idc, req.body.periodo))) {
    return res.status(403).json({ message: PERIODO_CERRADO_MSG });
  }

  const finMes = new Date(Date.UTC(periodoMes.getUTCFullYear(), periodoMes.getUTCMonth() + 1, 0));

  // Tarifas fijas, automáticas, mensuales y vigentes en el período.
  const cuotas = await prisma.cuotas.findMany({
    where: {
      id_complejo: idc,
      activo: true,
      aplica_auto: true,
      tipo: "fijo",
      periodicidad: "mensual",
      aplica_desde: { lte: finMes },
      OR: [{ aplica_hasta: null }, { aplica_hasta: { gte: periodoMes } }],
    },
  });
  const cuotasPorEstado = cuotas.filter((c) => c.id_estado_unidad);
  const cuotasGenerales = cuotas.filter((c) => !c.id_estado_unidad);

  // Unidades activas del complejo (con datos para el detalle por propiedad).
  const unidades = await prisma.unidades.findMany({
    where: { id_complejo: idc, activo: true },
    select: {
      id: true,
      id_estado_unidad: true,
      numero_propiedad: true,
      calle: true,
      bloque: true,
      bloques: { select: { nombre: true } },
      calles: { select: { nombre: true } },
      estados_unidad: { select: { nombre: true } },
      historial_propietarios: {
        where: { fecha_fin: null },
        select: { propietarios: { select: { nombre: true, apellido: true } } },
      },
    },
  });
  const infoUnidad = new Map(unidades.map((u) => [u.id, u]));

  // Cargos ya existentes del período (para no duplicar).
  const existentes = await prisma.cargos.findMany({
    where: { id_complejo: idc, periodo_mes: periodoMes },
    select: { id_unidad: true, concepto: true },
  });
  const yaExiste = new Set(existentes.map((c) => `${c.id_unidad}|${c.concepto}`));

  const nuevos: Prisma.cargosCreateManyInput[] = [];
  const sinCategoria: string[] = [];

  for (const u of unidades) {
    const aplicables = [
      ...(u.id_estado_unidad
        ? cuotasPorEstado.filter((c) => c.id_estado_unidad === u.id_estado_unidad)
        : []),
      ...cuotasGenerales,
    ];
    if (!u.id_estado_unidad && cuotasPorEstado.length > 0) sinCategoria.push(u.id);

    for (const c of aplicables) {
      const key = `${u.id}|${c.concepto}`;
      if (yaExiste.has(key)) continue;
      yaExiste.add(key);
      nuevos.push({
        id_complejo: idc,
        id_unidad: u.id,
        id_cuota: c.id,
        concepto: c.concepto,
        periodo_mes: periodoMes,
        monto: c.monto,
        saldo: c.monto,
        estado: "pendiente",
      });
    }
  }

  // Agrupa lo que se va a generar por concepto (tipo de pago) — para el preview.
  const grupos = new Map<string, { concepto: string; cantidad: number; total: number; unidades: string[] }>();
  for (const n of nuevos) {
    const g = grupos.get(n.concepto) ?? { concepto: n.concepto, cantidad: 0, total: 0, unidades: [] };
    g.cantidad += 1;
    g.total = Math.round((g.total + Number(n.monto)) * 100) / 100;
    g.unidades.push(n.id_unidad);
    grupos.set(n.concepto, g);
  }
  const porConcepto = [...grupos.values()].sort((a, b) => a.concepto.localeCompare(b.concepto));
  const totalMonto = Math.round(nuevos.reduce((s, n) => s + Number(n.monto), 0) * 100) / 100;

  // Detalle por propiedad: código, número de casa/lote, calle, bloque, propietario.
  type PropFila = {
    id: string;
    numero_propiedad: string | null;
    calle: string | null;
    bloque: string | null;
    tipo: string | null;
    propietario: string | null;
    conceptos: { concepto: string; monto: number }[];
    total: number;
  };
  const propMap = new Map<string, PropFila>();
  for (const n of nuevos) {
    let g = propMap.get(n.id_unidad);
    if (!g) {
      const u = infoUnidad.get(n.id_unidad);
      const prop = u?.historial_propietarios[0]?.propietarios;
      g = {
        id: n.id_unidad,
        numero_propiedad: u?.numero_propiedad ?? null,
        calle: u?.calles?.nombre ?? u?.calle ?? null,
        bloque: u?.bloques?.nombre ?? u?.bloque ?? null,
        tipo: u?.estados_unidad?.nombre ?? null,
        propietario: prop ? `${prop.nombre} ${prop.apellido}` : null,
        conceptos: [],
        total: 0,
      };
      propMap.set(n.id_unidad, g);
    }
    g.conceptos.push({ concepto: n.concepto, monto: Number(n.monto) });
    g.total = Math.round((g.total + Number(n.monto)) * 100) / 100;
  }
  const porPropiedad = [...propMap.values()].sort((a, b) => a.id.localeCompare(b.id));

  // Modo preview: NO inserta, solo devuelve el desglose.
  if (req.body?.preview) {
    return res.json({
      periodo: req.body.periodo,
      preview: true,
      total_cargos: nuevos.length,
      total_monto: totalMonto,
      unidades_procesadas: unidades.length,
      por_concepto: porConcepto,
      por_propiedad: porPropiedad,
      sin_categoria: sinCategoria,
    });
  }

  if (nuevos.length > 0) {
    await prisma.cargos.createMany({ data: nuevos });
  }

  res.status(201).json({
    periodo: req.body.periodo,
    creados: nuevos.length,
    total_monto: totalMonto,
    unidades_procesadas: unidades.length,
    por_concepto: porConcepto,
    por_propiedad: porPropiedad,
    sin_categoria: sinCategoria, // unidades sin estado: no se generó su mantenimiento
  });
});

/* =========================== CARGO MANUAL =========================== */

// POST /cargos { id_unidad, periodo, concepto, monto, fecha_vencimiento? }
// Para conceptos variables (Agua) o cargos puntuales.
router.post("/", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const { id_unidad, periodo, concepto, monto, fecha_vencimiento } = req.body ?? {};
  const periodoMes = periodoToDate(periodo);
  if (!id_unidad || !concepto?.trim() || !periodoMes) {
    return res.status(400).json({ message: "id_unidad, concepto y periodo (YYYY-MM) son requeridos" });
  }
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum < 0) {
    return res.status(400).json({ message: "monto inválido" });
  }
  if (await estaPeriodoCerrado(idc, periodo)) return res.status(403).json({ message: PERIODO_CERRADO_MSG });

  const unidad = await prisma.unidades.findUnique({ where: { id: id_unidad } });
  if (!unidad || unidad.id_complejo !== idc) {
    return res.status(404).json({ message: "Unidad no encontrada en este complejo" });
  }

  try {
    const cargo = await prisma.cargos.create({
      data: {
        id_complejo: idc,
        id_unidad,
        concepto: concepto.trim(),
        periodo_mes: periodoMes,
        monto: montoNum,
        saldo: montoNum,
        estado: "pendiente",
        ...(fecha_vencimiento ? { fecha_vencimiento: new Date(fecha_vencimiento) } : {}),
      },
    });
    res.status(201).json(cargo);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return res.status(409).json({ message: "Ya existe ese concepto para la unidad en el período" });
    }
    throw e;
  }
});

// PUT /cargos/:id — editar monto (captura de variable) / vencimiento.
router.put("/:id", soloAdmin, async (req, res) => {
  const cargo = await prisma.cargos.findUnique({ where: { id: req.params.id } });
  if (!cargo || (req.complejoId && cargo.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Cargo no encontrado" });
  }
  if (await estaPeriodoCerrado(cargo.id_complejo, periodoDeFecha(cargo.periodo_mes))) {
    return res.status(403).json({ message: PERIODO_CERRADO_MSG });
  }
  const { monto, fecha_vencimiento } = req.body ?? {};
  const data: Prisma.cargosUpdateInput = {};
  if (monto !== undefined) {
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      return res.status(400).json({ message: "monto inválido" });
    }
    const pagado = cargo.monto.minus(cargo.saldo); // lo ya abonado
    const nuevoSaldo = Math.max(0, montoNum - pagado.toNumber());
    data.monto = montoNum;
    data.saldo = nuevoSaldo;
    data.estado = nuevoSaldo === 0 ? "pagado" : pagado.toNumber() > 0 ? "parcial" : "pendiente";
  }
  if (fecha_vencimiento !== undefined) {
    data.fecha_vencimiento = fecha_vencimiento ? new Date(fecha_vencimiento) : null;
  }
  const updated = await prisma.cargos.update({ where: { id: req.params.id }, data });
  res.json(updated);
});

// DELETE /cargos/:id — anular cargo.
router.delete("/:id", soloAdmin, async (req, res) => {
  const cargo = await prisma.cargos.findUnique({ where: { id: req.params.id } });
  if (!cargo || (req.complejoId && cargo.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Cargo no encontrado" });
  }
  if (await estaPeriodoCerrado(cargo.id_complejo, periodoDeFecha(cargo.periodo_mes))) {
    return res.status(403).json({ message: PERIODO_CERRADO_MSG });
  }
  await prisma.cargos.update({
    where: { id: req.params.id },
    data: { estado: "anulado", saldo: 0 },
  });
  res.status(204).end();
});

export default router;
