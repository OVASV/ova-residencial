import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

const router = Router();

// Devuelve el complejo para operaciones de escritura; responde 400 si no hay.
function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({
      message: "Complejo no especificado (superadmin: enviar header X-Complejo-ID)",
    });
    return null;
  }
  return req.complejoId;
}

const paisSelect = { select: { id: true, nombre: true, codigo_iso2: true } };

// GET /propietarios — lista con filtros (q, activo). Filtra por complejo.
router.get("/", async (req, res) => {
  const { q, activo } = req.query as { q?: string; activo?: string };
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  if (activo === "true" || activo === "false") where.activo = activo === "true";
  if (q) {
    where.OR = [
      { nombre: { contains: q } },
      { apellido: { contains: q } },
      { dpi_nit: { contains: q } },
      { email: { contains: q } },
    ];
  }
  const data = await prisma.propietarios.findMany({
    where,
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
    include: {
      paises: paisSelect,
      historial_propietarios: {
        where: { fecha_fin: null },
        select: {
          id_unidad: true,
          fecha_inicio: true,
          unidades: { select: { numero_propiedad: true } },
        },
      },
    },
  });
  res.json(data);
});

// GET /propietarios/:id — detalle con país y unidades actuales.
router.get("/:id", async (req, res) => {
  const prop = await prisma.propietarios.findUnique({
    where: { id: req.params.id },
    include: {
      paises: paisSelect,
      historial_propietarios: {
        where: { fecha_fin: null },
        include: { unidades: { select: { id: true, bloque: true } } },
      },
    },
  });
  if (!prop || (req.complejoId && prop.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Propietario no encontrado" });
  }
  res.json(prop);
});

// POST /propietarios — crea propietario; opcionalmente lo asigna a una unidad
// disponible en la misma transacción (flujo 7.4).
router.post("/", async (req, res) => {
  const idComplejo = complejoEscritura(req, res);
  if (!idComplejo) return;

  const {
    nombre,
    apellido,
    dpi_nit,
    telefono,
    email,
    direccion,
    id_pais,
    fecha_registro,
    activo,
    asignacion,
  } = req.body ?? {};

  if (!nombre?.trim() || !apellido?.trim()) {
    return res.status(400).json({ message: "nombre y apellido son requeridos" });
  }

  // Unicidad de dpi_nit / email dentro del complejo.
  const orClauses = [
    ...(dpi_nit ? [{ dpi_nit }] : []),
    ...(email ? [{ email }] : []),
  ];
  if (orClauses.length > 0) {
    const dup = await prisma.propietarios.findFirst({
      where: { id_complejo: idComplejo, OR: orClauses },
    });
    if (dup) {
      return res.status(409).json({ message: "Ya existe un propietario con ese DPI/NIT o email" });
    }
  }

  const dataProp = {
    id_complejo: idComplejo,
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    dpi_nit: dpi_nit || null,
    telefono: telefono || null,
    email: email || null,
    direccion: direccion || null,
    id_pais: id_pais ?? null,
    ...(fecha_registro ? { fecha_registro: new Date(fecha_registro) } : {}),
    activo: activo ?? true,
  };

  // Sin asignación: creación simple.
  if (!asignacion?.id_unidad) {
    const creado = await prisma.propietarios.create({ data: dataProp });
    return res.status(201).json(creado);
  }

  // Con asignación: validar unidad disponible y crear todo en una transacción.
  const { id_unidad, fecha_inicio, motivo } = asignacion;
  if (!fecha_inicio) {
    return res.status(400).json({ message: "asignacion.fecha_inicio es requerida" });
  }

  const unidad = await prisma.unidades.findUnique({
    where: { id: id_unidad },
    include: { historial_propietarios: { where: { fecha_fin: null } } },
  });
  if (!unidad || unidad.id_complejo !== idComplejo) {
    return res.status(404).json({ message: "Unidad no encontrada en este complejo" });
  }
  if (unidad.historial_propietarios.length > 0) {
    return res.status(409).json({
      message: "La unidad ya tiene propietario actual; usar transferencia en /unidades/:id/propietario",
    });
  }

  try {
    const creado = await prisma.$transaction(async (tx) => {
      const prop = await tx.propietarios.create({ data: dataProp });
      await tx.historial_propietarios.create({
        data: {
          id_unidad,
          id_propietario: prop.id,
          fecha_inicio: new Date(fecha_inicio),
          fecha_fin: null,
          motivo: motivo || null,
        },
      });
      return prop;
    });
    res.status(201).json(creado);
  } catch (e) {
    res.status(400).json({ message: "No se pudo asignar la unidad", detail: String(e) });
  }
});

// PUT /propietarios/:id — editar.
router.put("/:id", async (req, res) => {
  const existing = await prisma.propietarios.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Propietario no encontrado" });
  }
  const { nombre, apellido, dpi_nit, telefono, email, direccion, id_pais, activo } = req.body ?? {};
  const updated = await prisma.propietarios.update({
    where: { id: req.params.id },
    data: {
      ...(nombre !== undefined ? { nombre } : {}),
      ...(apellido !== undefined ? { apellido } : {}),
      ...(dpi_nit !== undefined ? { dpi_nit: dpi_nit || null } : {}),
      ...(telefono !== undefined ? { telefono: telefono || null } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(direccion !== undefined ? { direccion: direccion || null } : {}),
      ...(id_pais !== undefined ? { id_pais: id_pais ?? null } : {}),
      ...(activo !== undefined ? { activo } : {}),
      updated_at: new Date(),
    },
  });
  res.json(updated);
});

// DELETE /propietarios/:id — desactivar (soft delete).
router.delete("/:id", async (req, res) => {
  const existing = await prisma.propietarios.findUnique({ where: { id: req.params.id } });
  if (!existing || (req.complejoId && existing.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Propietario no encontrado" });
  }
  await prisma.propietarios.update({
    where: { id: req.params.id },
    data: { activo: false, updated_at: new Date() },
  });
  res.status(204).end();
});

export default router;
