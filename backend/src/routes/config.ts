import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { CATEGORIAS } from "./gastos.js";

const router = Router();

// Solo admin / superadmin pueden modificar la configuración.
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

/* ============================ ESTADOS DE UNIDAD ============================ */

// GET /config/estados
router.get("/estados", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  const data = await prisma.estados_unidad.findMany({
    where,
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });
  res.json(data);
});

// POST /config/estados
router.post("/estados", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { nombre, orden } = req.body ?? {};
  if (!nombre?.trim()) return res.status(400).json({ message: "nombre es requerido" });

  const dup = await prisma.estados_unidad.findFirst({
    where: { id_complejo: idc, nombre: nombre.trim() },
  });
  if (dup) return res.status(409).json({ message: "Ya existe un estado con ese nombre" });

  const creado = await prisma.estados_unidad.create({
    data: { id_complejo: idc, nombre: nombre.trim(), orden: orden ?? 0 },
  });
  res.status(201).json(creado);
});

// PUT /config/estados/:id
router.put("/estados/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.estados_unidad.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Estado no encontrado" });
  }
  const { nombre, orden, activo } = req.body ?? {};
  const updated = await prisma.estados_unidad.update({
    where: { id: req.params.id },
    data: {
      ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
      ...(orden !== undefined ? { orden } : {}),
      ...(activo !== undefined ? { activo } : {}),
    },
  });
  res.json(updated);
});

// DELETE /config/estados/:id — desactivar (soft delete; está referenciado por unidades/cuotas).
router.delete("/estados/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.estados_unidad.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Estado no encontrado" });
  }
  await prisma.estados_unidad.update({
    where: { id: req.params.id },
    data: { activo: false },
  });
  res.status(204).end();
});

/* ================================ CUOTAS / TARIFAS ================================ */

// GET /config/cuotas
router.get("/cuotas", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  const data = await prisma.cuotas.findMany({
    where,
    orderBy: [{ concepto: "asc" }],
    include: { estados_unidad: { select: { id: true, nombre: true } } },
  });
  res.json(data);
});

// POST /config/cuotas
router.post("/cuotas", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const {
    concepto,
    monto,
    tipo,
    id_estado_unidad,
    periodicidad,
    aplica_auto,
    aplica_desde,
    aplica_hasta,
  } = req.body ?? {};

  if (!concepto?.trim()) return res.status(400).json({ message: "concepto es requerido" });

  // Si trae estado, validar que pertenece al complejo.
  if (id_estado_unidad) {
    const estado = await prisma.estados_unidad.findUnique({ where: { id: id_estado_unidad } });
    if (!estado || estado.id_complejo !== idc) {
      return res.status(400).json({ message: "Estado de unidad inválido" });
    }
  }

  const creada = await prisma.cuotas.create({
    data: {
      id_complejo: idc,
      concepto: concepto.trim(),
      monto: monto ?? 0,
      moneda: "USD",
      tipo: tipo === "variable" ? "variable" : "fijo",
      id_estado_unidad: id_estado_unidad || null,
      periodicidad: periodicidad || "mensual",
      aplica_auto: aplica_auto ?? true,
      ...(aplica_desde ? { aplica_desde: new Date(aplica_desde) } : {}),
      ...(aplica_hasta ? { aplica_hasta: new Date(aplica_hasta) } : {}),
    },
    include: { estados_unidad: { select: { id: true, nombre: true } } },
  });
  res.status(201).json(creada);
});

// PUT /config/cuotas/:id
router.put("/cuotas/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.cuotas.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Cuota no encontrada" });
  }
  const { concepto, monto, tipo, id_estado_unidad, periodicidad, aplica_auto, aplica_hasta, activo } =
    req.body ?? {};

  if (id_estado_unidad) {
    const estado = await prisma.estados_unidad.findUnique({ where: { id: id_estado_unidad } });
    if (!estado || (req.complejoId && estado.id_complejo !== req.complejoId)) {
      return res.status(400).json({ message: "Estado de unidad inválido" });
    }
  }

  const updated = await prisma.cuotas.update({
    where: { id: req.params.id },
    data: {
      ...(concepto !== undefined ? { concepto: String(concepto).trim() } : {}),
      ...(monto !== undefined ? { monto } : {}),
      ...(tipo !== undefined ? { tipo: tipo === "variable" ? "variable" : "fijo" } : {}),
      ...(id_estado_unidad !== undefined ? { id_estado_unidad: id_estado_unidad || null } : {}),
      ...(periodicidad !== undefined ? { periodicidad } : {}),
      ...(aplica_auto !== undefined ? { aplica_auto } : {}),
      ...(aplica_hasta !== undefined ? { aplica_hasta: aplica_hasta ? new Date(aplica_hasta) : null } : {}),
      ...(activo !== undefined ? { activo } : {}),
    },
    include: { estados_unidad: { select: { id: true, nombre: true } } },
  });
  res.json(updated);
});

// DELETE /config/cuotas/:id — desactivar (soft delete).
router.delete("/cuotas/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.cuotas.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Cuota no encontrada" });
  }
  await prisma.cuotas.update({ where: { id: req.params.id }, data: { activo: false } });
  res.status(204).end();
});

/* ============================== BLOQUES ============================== */

router.get("/bloques", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  res.json(await prisma.bloques.findMany({ where, orderBy: { nombre: "asc" } }));
});

router.post("/bloques", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { nombre } = req.body ?? {};
  if (!nombre?.trim()) return res.status(400).json({ message: "nombre es requerido" });
  const dup = await prisma.bloques.findFirst({ where: { id_complejo: idc, nombre: nombre.trim() } });
  if (dup) return res.status(409).json({ message: "Ya existe un bloque con ese nombre" });
  res.status(201).json(await prisma.bloques.create({ data: { id_complejo: idc, nombre: nombre.trim() } }));
});

router.put("/bloques/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.bloques.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Bloque no encontrado" });
  }
  const { nombre, activo } = req.body ?? {};
  res.json(await prisma.bloques.update({
    where: { id: req.params.id },
    data: { ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}), ...(activo !== undefined ? { activo } : {}) },
  }));
});

router.delete("/bloques/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.bloques.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Bloque no encontrado" });
  }
  await prisma.bloques.update({ where: { id: req.params.id }, data: { activo: false } });
  res.status(204).end();
});

/* ============================== CALLES ============================== */

router.get("/calles", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  res.json(await prisma.calles.findMany({ where, orderBy: { nombre: "asc" } }));
});

router.post("/calles", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { nombre } = req.body ?? {};
  if (!nombre?.trim()) return res.status(400).json({ message: "nombre es requerido" });
  const dup = await prisma.calles.findFirst({ where: { id_complejo: idc, nombre: nombre.trim() } });
  if (dup) return res.status(409).json({ message: "Ya existe una calle con ese nombre" });
  res.status(201).json(await prisma.calles.create({ data: { id_complejo: idc, nombre: nombre.trim() } }));
});

router.put("/calles/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.calles.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Calle no encontrada" });
  }
  const { nombre, activo } = req.body ?? {};
  res.json(await prisma.calles.update({
    where: { id: req.params.id },
    data: { ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}), ...(activo !== undefined ? { activo } : {}) },
  }));
});

router.delete("/calles/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.calles.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Calle no encontrada" });
  }
  await prisma.calles.update({ where: { id: req.params.id }, data: { activo: false } });
  res.status(204).end();
});

/* ================================ PISOS ================================ */

router.get("/pisos", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  res.json(await prisma.pisos.findMany({ where, orderBy: { nombre: "asc" } }));
});

router.post("/pisos", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { nombre } = req.body ?? {};
  if (!nombre?.trim()) return res.status(400).json({ message: "nombre es requerido" });
  const dup = await prisma.pisos.findFirst({ where: { id_complejo: idc, nombre: nombre.trim() } });
  if (dup) return res.status(409).json({ message: "Ya existe un piso con ese nombre" });
  res.status(201).json(await prisma.pisos.create({ data: { id_complejo: idc, nombre: nombre.trim() } }));
});

router.put("/pisos/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.pisos.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Piso no encontrado" });
  }
  const { nombre, activo } = req.body ?? {};
  res.json(await prisma.pisos.update({
    where: { id: req.params.id },
    data: { ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}), ...(activo !== undefined ? { activo } : {}) },
  }));
});

router.delete("/pisos/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.pisos.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Piso no encontrado" });
  }
  await prisma.pisos.update({ where: { id: req.params.id }, data: { activo: false } });
  res.status(204).end();
});

/* ======================= ITEMS DE PRESUPUESTO ======================= */

router.get("/items-presupuesto", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  res.json(await prisma.items_presupuesto.findMany({ where, orderBy: [{ categoria: "asc" }, { orden: "asc" }, { nombre: "asc" }] }));
});

router.post("/items-presupuesto", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { categoria, nombre } = req.body ?? {};
  if (!CATEGORIAS.includes(categoria)) return res.status(400).json({ message: "categoría inválida" });
  if (!nombre?.trim()) return res.status(400).json({ message: "nombre es requerido" });
  const dup = await prisma.items_presupuesto.findFirst({ where: { id_complejo: idc, categoria, nombre: nombre.trim() } });
  if (dup) return res.status(409).json({ message: "Ya existe ese item en la categoría" });
  res.status(201).json(await prisma.items_presupuesto.create({ data: { id_complejo: idc, categoria, nombre: nombre.trim() } }));
});

router.put("/items-presupuesto/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.items_presupuesto.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Item no encontrado" });
  }
  const { nombre, categoria, activo } = req.body ?? {};
  if (categoria !== undefined && !CATEGORIAS.includes(categoria)) return res.status(400).json({ message: "categoría inválida" });
  res.json(await prisma.items_presupuesto.update({
    where: { id: req.params.id },
    data: {
      ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
      ...(categoria !== undefined ? { categoria } : {}),
      ...(activo !== undefined ? { activo } : {}),
    },
  }));
});

router.delete("/items-presupuesto/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.items_presupuesto.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Item no encontrado" });
  }
  await prisma.items_presupuesto.update({ where: { id: req.params.id }, data: { activo: false } });
  res.status(204).end();
});

/* ================================ BANCOS ================================ */

router.get("/bancos", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  res.json(await prisma.bancos.findMany({ where, orderBy: { nombre: "asc" } }));
});

router.post("/bancos", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const { nombre } = req.body ?? {};
  if (!nombre?.trim()) return res.status(400).json({ message: "nombre es requerido" });
  const dup = await prisma.bancos.findFirst({ where: { id_complejo: idc, nombre: nombre.trim() } });
  if (dup) return res.status(409).json({ message: "Ya existe un banco con ese nombre" });
  res.status(201).json(await prisma.bancos.create({ data: { id_complejo: idc, nombre: nombre.trim() } }));
});

router.put("/bancos/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.bancos.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Banco no encontrado" });
  }
  const { nombre, activo } = req.body ?? {};
  res.json(await prisma.bancos.update({
    where: { id: req.params.id },
    data: { ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}), ...(activo !== undefined ? { activo } : {}) },
  }));
});

router.delete("/bancos/:id", soloAdmin, async (req, res) => {
  const existing = await prisma.bancos.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Banco no encontrado" });
  }
  await prisma.bancos.update({ where: { id: req.params.id }, data: { activo: false } });
  res.status(204).end();
});

export default router;
