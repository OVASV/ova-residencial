import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { upload, tipoComprobante, borrarArchivo } from "../upload.js";
import { estaPeriodoCerrado, periodoDeFecha, PERIODO_CERRADO_MSG } from "../utils/cierres.js";

const router = Router();
const soloAdmin = requireRole("admin", "superadmin");

export const CATEGORIAS = [
  "seguridad",
  "limpieza",
  "mantenimiento",
  "servicios",
  "administrativo",
  "planilla",
  "extraordinario",
  "ajuste",
] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({ message: "Complejo no especificado (superadmin: enviar header X-Complejo-ID)" });
    return null;
  }
  return req.complejoId;
}

function periodoToDate(periodo: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo ?? "");
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(Number(m[1]), mes - 1, 1));
}

/* ============================ RESUMEN MENSUAL ============================ */

// GET /gastos/resumen-mensual?periodo=YYYY-MM — presupuesto vs ejecutado (sección 7.7).
router.get("/resumen-mensual", async (req, res) => {
  const periodoParam = (req.query.periodo as string) || new Date().toISOString().slice(0, 7);
  const periodoMes = periodoToDate(periodoParam);
  if (!periodoMes) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });

  // Modo rango (anual): ?desde=YYYY-MM agrega desde ese mes hasta el periodo (inclusive).
  const desdeParam = req.query.desde as string | undefined;
  const desdeMes = desdeParam ? periodoToDate(desdeParam) : null;
  const esRango = !!desdeMes && desdeMes <= periodoMes;

  const prevMes = new Date(Date.UTC(periodoMes.getUTCFullYear(), periodoMes.getUTCMonth() - 1, 1));
  const prevParam = prevMes.toISOString().slice(0, 7);
  const filtro = req.complejoId ? { id_complejo: req.complejoId } : {};

  const gastosWhere = esRango
    ? { ...filtro, periodo_mes: { gte: desdeMes!, lte: periodoMes } }
    : { ...filtro, periodo_mes: periodoMes };
  const presupWhere = esRango
    ? { ...filtro, periodo: { gte: desdeParam!, lte: periodoParam } }
    : { ...filtro, periodo: periodoParam };

  const [gastosMes, gastosPrev, presup] = await Promise.all([
    prisma.gastos.findMany({ where: gastosWhere }),
    esRango ? Promise.resolve([]) : prisma.gastos.findMany({ where: { ...filtro, periodo_mes: prevMes } }),
    prisma.presupuestos.findMany({ where: presupWhere }),
  ]);

  const ejecutadoPorCat = new Map<string, number>();
  for (const g of gastosMes) ejecutadoPorCat.set(g.categoria, (ejecutadoPorCat.get(g.categoria) ?? 0) + g.monto.toNumber());
  // Suma de los items de cada categoría (puede haber varios items por categoría).
  const presupPorCat = new Map<string, number>();
  for (const p of presup) presupPorCat.set(p.categoria, (presupPorCat.get(p.categoria) ?? 0) + p.monto.toNumber());

  const categorias = CATEGORIAS.map((cat) => {
    const ejecutado = r2(ejecutadoPorCat.get(cat) ?? 0);
    const presupuestado = r2(presupPorCat.get(cat) ?? 0);
    const pct = presupuestado > 0 ? Math.round((ejecutado / presupuestado) * 100) : ejecutado > 0 ? 100 : 0;
    return {
      categoria: cat,
      presupuestado,
      ejecutado,
      disponible: r2(presupuestado - ejecutado),
      pct,
      alerta: presupuestado > 0 && pct >= 90,
    };
  });

  const totalGastado = r2(gastosMes.reduce((s, g) => s + g.monto.toNumber(), 0));
  const totalPresupuesto = r2(presup.reduce((s, p) => s + p.monto.toNumber(), 0));
  const totalPrev = r2(gastosPrev.reduce((s, g) => s + g.monto.toNumber(), 0));
  const variacion = totalPrev > 0 ? Math.round(((totalGastado - totalPrev) / totalPrev) * 100) : null;

  const complejo = req.complejoId
    ? await prisma.complejos.findUnique({ where: { id: req.complejoId }, select: { nombre: true, logo_url: true } })
    : null;

  res.json({
    nombre_complejo: complejo?.nombre ?? null,
    logo_url: complejo?.logo_url ?? null,
    periodo: periodoParam,
    periodo_anterior: prevParam,
    desde: esRango ? desdeParam : null,
    kpis: {
      total_gastado: totalGastado,
      total_presupuesto: totalPresupuesto,
      disponible: r2(totalPresupuesto - totalGastado),
      num_transacciones: gastosMes.length,
      variacion_pct: variacion,
    },
    categorias,
  });
});

/* ============================ PRESUPUESTOS ============================ */

// GET /gastos/presupuesto?periodo=YYYY-MM — items con su monto presupuestado en el período.
router.get("/presupuesto", async (req, res) => {
  const periodo = req.query.periodo as string;
  if (!periodoToDate(periodo)) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });
  const filtro = req.complejoId ? { id_complejo: req.complejoId } : {};
  const [items, presup] = await Promise.all([
    prisma.items_presupuesto.findMany({ where: { ...filtro, activo: true }, orderBy: [{ categoria: "asc" }, { orden: "asc" }, { nombre: "asc" }] }),
    prisma.presupuestos.findMany({ where: { ...filtro, periodo } }),
  ]);
  const rowPorItem = new Map(presup.filter((p) => p.id_item).map((p) => [p.id_item as string, p]));
  res.json(
    items.map((it) => {
      const row = rowPorItem.get(it.id);
      return {
        id_item: it.id,
        categoria: it.categoria,
        nombre: it.nombre,
        // Descripción de este mes (editable); por defecto el nombre del item.
        descripcion: row?.descripcion ?? it.nombre,
        monto: row?.monto ?? 0,
      };
    })
  );
});

// PUT /gastos/presupuesto — fija el monto de un ITEM en un período (upsert).
router.put("/presupuesto", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { periodo, id_item, monto, descripcion } = req.body ?? {};
  if (!periodoToDate(periodo)) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });
  if (!id_item) return res.status(400).json({ message: "id_item es requerido" });
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum < 0) return res.status(400).json({ message: "monto inválido" });
  const item = await prisma.items_presupuesto.findUnique({ where: { id: id_item } });
  if (!item || item.id_complejo !== idc) return res.status(400).json({ message: "Item inválido" });

  // Descripción de este mes: la que envíe el usuario, o por defecto el nombre del item.
  const desc = typeof descripcion === "string" && descripcion.trim() ? descripcion.trim() : item.nombre;
  const existing = await prisma.presupuestos.findFirst({ where: { id_complejo: idc, periodo, id_item } });
  const saved = existing
    ? await prisma.presupuestos.update({ where: { id: existing.id }, data: { monto: montoNum, categoria: item.categoria, descripcion: desc } })
    : await prisma.presupuestos.create({ data: { id_complejo: idc, periodo, id_item, categoria: item.categoria, descripcion: desc, monto: montoNum } });
  res.json(saved);
});

// POST /gastos/presupuesto/copiar { origen, destino } — copia el presupuesto de un mes a otro.
router.post("/presupuesto/copiar", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { origen, destino } = req.body ?? {};
  if (!periodoToDate(origen) || !periodoToDate(destino)) return res.status(400).json({ message: "origen y destino deben ser YYYY-MM" });
  if (origen === destino) return res.status(400).json({ message: "origen y destino no pueden ser iguales" });

  const fuente = await prisma.presupuestos.findMany({ where: { id_complejo: idc, periodo: origen, id_item: { not: null } } });
  if (fuente.length === 0) return res.status(400).json({ message: "El mes origen no tiene presupuesto" });
  const destinoActual = await prisma.presupuestos.findMany({ where: { id_complejo: idc, periodo: destino } });

  let creados = 0;
  let actualizados = 0;
  for (const p of fuente) {
    const ex = destinoActual.find((d) => d.id_item === p.id_item);
    if (ex) {
      await prisma.presupuestos.update({ where: { id: ex.id }, data: { monto: p.monto, categoria: p.categoria, descripcion: p.descripcion } });
      actualizados++;
    } else {
      await prisma.presupuestos.create({ data: { id_complejo: idc, periodo: destino, id_item: p.id_item, categoria: p.categoria, descripcion: p.descripcion, monto: p.monto } });
      creados++;
    }
  }
  res.json({ origen, destino, creados, actualizados });
});

/* ================================ GASTOS ================================ */

// GET /gastos?periodo=YYYY-MM&categoria=
router.get("/", async (req, res) => {
  const { periodo, categoria, desde } = req.query as { periodo?: string; categoria?: string; desde?: string };
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  if (categoria) where.categoria = categoria;
  if (periodo) {
    const d = periodoToDate(periodo);
    if (!d) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });
    const dDesde = desde ? periodoToDate(desde) : null;
    // Modo rango (anual): desde..periodo inclusive
    where.periodo_mes = dDesde && dDesde <= d ? { gte: dDesde, lte: d } : d;
  }
  const data = await prisma.gastos.findMany({
    where,
    orderBy: { fecha: "desc" },
    include: { items_presupuesto: { select: { nombre: true } } },
  });
  res.json(data.map((g) => ({ ...g, item_nombre: g.items_presupuesto?.nombre ?? null, items_presupuesto: undefined })));
});

// POST /gastos
router.post("/", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { categoria, descripcion, proveedor, no_factura, monto, fecha, metodo, id_item } = req.body ?? {};
  if (!CATEGORIAS.includes(categoria)) return res.status(400).json({ message: "categoría inválida" });
  if (!descripcion?.trim() || !fecha) return res.status(400).json({ message: "descripcion y fecha son requeridos" });
  const montoNum = Number(monto);
  // Se permite negativo para ajustes/saldo inicial (suma a la caja). Solo se bloquea 0.
  if (!Number.isFinite(montoNum) || montoNum === 0) return res.status(400).json({ message: "monto inválido" });
  if (metodo && !["transferencia", "efectivo", "cheque"].includes(metodo)) {
    return res.status(400).json({ message: "método inválido" });
  }

  const fechaD = new Date(fecha);
  const periodoMes = new Date(Date.UTC(fechaD.getUTCFullYear(), fechaD.getUTCMonth(), 1));
  if (await estaPeriodoCerrado(idc, periodoDeFecha(fechaD))) return res.status(403).json({ message: PERIODO_CERRADO_MSG });
  try {
    const creado = await prisma.gastos.create({
      data: {
        id_complejo: idc,
        categoria,
        descripcion: descripcion.trim(),
        proveedor: proveedor?.trim() || null,
        no_factura: no_factura?.trim() || null,
        monto: montoNum,
        fecha: fechaD,
        periodo_mes: periodoMes,
        metodo: metodo || null,
        id_item: id_item || null,
        registrado_por: req.user?.sub ?? null,
      },
    });
    res.status(201).json(creado);
  } catch (err: any) {
    res.status(400).json({ message: err?.message ?? "Error al guardar el gasto" });
  }
});

// PUT /gastos/:id
router.put("/:id", soloAdmin, async (req, res) => {
  const g = await prisma.gastos.findUnique({ where: { id: req.params.id } });
  if (!g || (req.complejoId && g.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Gasto no encontrado" });
  }
  const { categoria, descripcion, proveedor, no_factura, monto, fecha, metodo, id_item } = req.body ?? {};
  if (categoria !== undefined && !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ message: "categoría inválida" });
  }
  // No se puede modificar un gasto de un mes cerrado, ni moverlo a un mes cerrado.
  if (await estaPeriodoCerrado(g.id_complejo, periodoDeFecha(g.fecha))) return res.status(403).json({ message: PERIODO_CERRADO_MSG });
  if (req.body?.fecha !== undefined) {
    const nueva = new Date(req.body.fecha);
    if (await estaPeriodoCerrado(g.id_complejo, periodoDeFecha(nueva))) return res.status(403).json({ message: PERIODO_CERRADO_MSG });
  }
  const data: Record<string, unknown> = {};
  if (categoria !== undefined) data.categoria = categoria;
  if (id_item !== undefined) data.id_item = id_item || null;
  if (descripcion !== undefined) data.descripcion = String(descripcion).trim();
  if (proveedor !== undefined) data.proveedor = proveedor || null;
  if (no_factura !== undefined) data.no_factura = no_factura || null;
  if (monto !== undefined) {
    const m = Number(monto);
    if (!Number.isFinite(m) || m === 0) return res.status(400).json({ message: "monto inválido" });
    data.monto = m;
  }
  if (metodo !== undefined) data.metodo = metodo || null;
  if (fecha !== undefined) {
    const fechaD = new Date(fecha);
    data.fecha = fechaD;
    data.periodo_mes = new Date(Date.UTC(fechaD.getUTCFullYear(), fechaD.getUTCMonth(), 1));
  }
  const updated = await prisma.gastos.update({ where: { id: req.params.id }, data });
  res.json(updated);
});

// DELETE /gastos/:id
router.delete("/:id", soloAdmin, async (req, res) => {
  const g = await prisma.gastos.findUnique({ where: { id: req.params.id } });
  if (!g || (req.complejoId && g.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Gasto no encontrado" });
  }
  if (await estaPeriodoCerrado(g.id_complejo, periodoDeFecha(g.fecha))) return res.status(403).json({ message: PERIODO_CERRADO_MSG });
  await prisma.gastos.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

/* ============================ COMPROBANTE / FACTURA ============================ */

// POST /gastos/:id/comprobante — adjunta factura/recibo (multipart, campo "archivo").
router.post("/:id/comprobante", soloAdmin, upload.single("archivo"), async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) {
    if (req.file) borrarArchivo(`/uploads/${req.file.filename}`);
    return;
  }
  if (!req.file) return res.status(400).json({ message: "archivo requerido" });
  const gasto = await prisma.gastos.findUnique({ where: { id: req.params.id } });
  if (!gasto || gasto.id_complejo !== idc) {
    borrarArchivo(`/uploads/${req.file.filename}`);
    return res.status(404).json({ message: "Gasto no encontrado" });
  }
  borrarArchivo(gasto.comprobante_url);
  const updated = await prisma.gastos.update({
    where: { id: gasto.id },
    data: {
      comprobante_url: `/uploads/${req.file.filename}`,
      comprobante_nombre: req.file.originalname,
      comprobante_tipo: tipoComprobante(req.file.mimetype),
    },
  });
  res.json(updated);
});

// DELETE /gastos/:id/comprobante
router.delete("/:id/comprobante", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const gasto = await prisma.gastos.findUnique({ where: { id: req.params.id } });
  if (!gasto || gasto.id_complejo !== idc) return res.status(404).json({ message: "Gasto no encontrado" });
  borrarArchivo(gasto.comprobante_url);
  const updated = await prisma.gastos.update({
    where: { id: gasto.id },
    data: { comprobante_url: null, comprobante_nombre: null, comprobante_tipo: null },
  });
  res.json(updated);
});

export default router;
