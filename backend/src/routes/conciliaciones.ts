import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();
const soloAdmin = requireRole("admin", "superadmin");

function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({ message: "Complejo no especificado (superadmin: enviar header X-Complejo-ID)" });
    return null;
  }
  return req.complejoId;
}

// 'YYYY-MM' -> rango [primer día, primer día del mes siguiente).
function periodoRango(periodo: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { gte: new Date(Date.UTC(y, mes - 1, 1)), lt: new Date(Date.UTC(y, mes, 1)) };
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s?: string | null) => (s ?? "").trim().toUpperCase();

// Arma el detalle completo de una conciliación: líneas (con su pago) + los
// pagos del período sin match (sin_match_sistema) + un resumen de conteos.
async function detalle(id: string) {
  const c = await prisma.conciliaciones.findUnique({
    where: { id },
    include: {
      conciliacion_lineas: {
        include: {
          pagos: {
            select: { id: true, id_unidad: true, monto_total: true, referencia_banco: true, fecha_pago: true, metodo: true },
          },
        },
        orderBy: { monto: "desc" },
      },
    },
  });
  if (!c) return null;

  const rango = periodoRango(c.periodo)!;
  const matched = new Set(c.conciliacion_lineas.map((l) => l.id_pago).filter(Boolean) as string[]);
  const pagosPeriodo = await prisma.pagos.findMany({
    where: { id_complejo: c.id_complejo, estado: { not: "anulado" }, fecha_pago: rango },
    select: { id: true, id_unidad: true, monto_total: true, referencia_banco: true, fecha_pago: true, metodo: true },
  });
  const sinMatchSistema = pagosPeriodo.filter((p) => !matched.has(p.id));

  return {
    ...c,
    sin_match_sistema: sinMatchSistema,
    resumen: {
      conciliado: c.conciliacion_lineas.filter((l) => l.tipo_match === "conciliado").length,
      diferencia: c.conciliacion_lineas.filter((l) => l.tipo_match === "diferencia").length,
      sin_match_banco: c.conciliacion_lineas.filter((l) => l.tipo_match === "sin_match_banco").length,
      sin_match_sistema: sinMatchSistema.length,
    },
  };
}

/* ================================ LISTAR ================================ */

router.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  if (req.query.periodo) where.periodo = req.query.periodo;
  const data = await prisma.conciliaciones.findMany({
    where,
    orderBy: { created_at: "desc" },
    include: { _count: { select: { conciliacion_lineas: true } } },
  });
  res.json(data);
});

router.get("/:id", async (req, res) => {
  const d = await detalle(req.params.id);
  if (!d || (req.complejoId && d.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Conciliación no encontrada" });
  }
  res.json(d);
});

/* ============================ CREAR + MATCH ============================ */

// POST /conciliaciones
// body: { periodo, banco?, archivo_nombre?, lineas: [{ fecha_mov?, monto, referencia?, descripcion? }] }
router.post("/", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const { periodo, banco, archivo_nombre, lineas } = req.body ?? {};
  const rango = periodoRango(periodo);
  if (!rango) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return res.status(400).json({ message: "lineas (movimientos del banco) es requerido" });
  }

  // Pagos disponibles del período (no anulados, aún sin conciliar).
  const pagos = await prisma.pagos.findMany({
    where: { id_complejo: idc, estado: { not: "anulado" }, id_conciliacion: null, fecha_pago: rango },
    select: { id: true, monto_total: true, referencia_banco: true },
  });

  // Algoritmo: 1) por referencia (más preciso) 2) por monto exacto. Un pago se
  // usa una sola vez. Si coincide por referencia pero difiere el monto -> 'diferencia'.
  const usados = new Set<string>();
  const lineasData = lineas.map((l: { fecha_mov?: string; monto: number; referencia?: string; descripcion?: string }) => {
    const monto = r2(Number(l.monto));
    const ref = norm(l.referencia);
    let id_pago: string | null = null;
    let tipo_match = "sin_match_banco";

    if (ref) {
      const p = pagos.find((x) => !usados.has(x.id) && norm(x.referencia_banco) === ref);
      if (p) {
        id_pago = p.id;
        usados.add(p.id);
        tipo_match = r2(p.monto_total.toNumber()) === monto ? "conciliado" : "diferencia";
      }
    }
    if (!id_pago) {
      const p = pagos.find((x) => !usados.has(x.id) && r2(x.monto_total.toNumber()) === monto);
      if (p) {
        id_pago = p.id;
        usados.add(p.id);
        tipo_match = "conciliado";
      }
    }
    return {
      id_complejo: idc,
      fecha_mov: l.fecha_mov ? new Date(l.fecha_mov) : null,
      monto,
      referencia: l.referencia ?? null,
      descripcion: l.descripcion ?? null,
      tipo_match,
      id_pago,
    };
  });

  const totalBanco = r2(lineasData.reduce((s, l) => s + l.monto, 0));
  const totalSistema = r2(pagos.reduce((s, p) => s + p.monto_total.toNumber(), 0));

  const creada = await prisma.$transaction(async (tx) => {
    const c = await tx.conciliaciones.create({
      data: {
        id_complejo: idc,
        periodo,
        banco: banco || null,
        archivo_nombre: archivo_nombre || null,
        estado: "en_revision",
        total_banco: totalBanco,
        total_sistema: totalSistema,
      },
    });
    await tx.conciliacion_lineas.createMany({
      data: lineasData.map((l) => ({ ...l, id_conciliacion: c.id })),
    });
    return c;
  });

  res.status(201).json(await detalle(creada.id));
});

/* ============================ MATCH MANUAL ============================ */

// POST /conciliaciones/:id/match { id_linea, id_pago | null }
router.post("/:id/match", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { id_linea, id_pago } = req.body ?? {};

  const c = await prisma.conciliaciones.findUnique({ where: { id: req.params.id } });
  if (!c || c.id_complejo !== idc) return res.status(404).json({ message: "Conciliación no encontrada" });
  if (c.estado === "confirmada" || c.estado === "anulada") {
    return res.status(409).json({ message: "La conciliación ya está cerrada" });
  }
  const linea = await prisma.conciliacion_lineas.findUnique({ where: { id: id_linea } });
  if (!linea || linea.id_conciliacion !== c.id) return res.status(404).json({ message: "Línea no encontrada" });

  // Desvincular
  if (!id_pago) {
    await prisma.conciliacion_lineas.update({
      where: { id: id_linea },
      data: { id_pago: null, tipo_match: "sin_match_banco" },
    });
    return res.json(await detalle(c.id));
  }

  const pago = await prisma.pagos.findUnique({ where: { id: id_pago } });
  if (!pago || pago.id_complejo !== idc) return res.status(404).json({ message: "Pago no encontrado" });

  const tipo = r2(pago.monto_total.toNumber()) === r2(linea.monto.toNumber()) ? "conciliado" : "diferencia";
  await prisma.conciliacion_lineas.update({
    where: { id: id_linea },
    data: { id_pago, tipo_match: tipo },
  });
  res.json(await detalle(c.id));
});

/* ============================== CONFIRMAR ============================== */

router.post("/:id/confirmar", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const c = await prisma.conciliaciones.findUnique({
    where: { id: req.params.id },
    include: { conciliacion_lineas: true },
  });
  if (!c || c.id_complejo !== idc) return res.status(404).json({ message: "Conciliación no encontrada" });
  if (c.estado === "confirmada") return res.status(409).json({ message: "Ya está confirmada" });

  const pagoIds = c.conciliacion_lineas.map((l) => l.id_pago).filter(Boolean) as string[];

  await prisma.$transaction(async (tx) => {
    if (pagoIds.length > 0) {
      await tx.pagos.updateMany({
        where: { id: { in: pagoIds } },
        data: { id_conciliacion: c.id, estado: "conciliado" },
      });
    }
    await tx.conciliaciones.update({
      where: { id: c.id },
      data: { estado: "confirmada", confirmado_por: req.user?.sub ?? null, confirmado_at: new Date() },
    });
  });
  res.json(await detalle(c.id));
});

/* =============================== ANULAR =============================== */

router.patch("/:id/anular", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const c = await prisma.conciliaciones.findUnique({ where: { id: req.params.id } });
  if (!c || c.id_complejo !== idc) return res.status(404).json({ message: "Conciliación no encontrada" });
  if (c.estado === "anulada") return res.status(409).json({ message: "Ya está anulada" });

  await prisma.$transaction(async (tx) => {
    // Revertir los pagos que había marcado como conciliados.
    await tx.pagos.updateMany({
      where: { id_conciliacion: c.id },
      data: { id_conciliacion: null, estado: "registrado" },
    });
    await tx.conciliaciones.update({ where: { id: c.id }, data: { estado: "anulada" } });
  });
  res.json(await detalle(c.id));
});

/* =============================== ELIMINAR =============================== */

router.delete("/:id", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const c = await prisma.conciliaciones.findUnique({ where: { id: req.params.id } });
  if (!c || c.id_complejo !== idc) return res.status(404).json({ message: "Conciliación no encontrada" });
  if (c.estado === "confirmada") {
    return res.status(409).json({ message: "Anula la conciliación antes de eliminarla" });
  }
  await prisma.conciliaciones.delete({ where: { id: c.id } }); // cascada elimina las líneas
  res.status(204).end();
});

export default router;
