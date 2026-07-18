import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();
const soloAdmin = requireRole("admin", "superadmin");

// GET /accesos — lista propietarios con sus unidades y si tienen usuario creado.
router.get("/", soloAdmin, async (req, res) => {
  const complejoId = req.complejoId!;

  const propietarios = await prisma.propietarios.findMany({
    where: { id_complejo: complejoId, activo: true },
    orderBy: [{ nombre: "asc" }, { apellido: "asc" }],
    select: {
      id: true,
      nombre: true,
      apellido: true,
      email: true,
      telefono: true,
      historial_propietarios: {
        where: { fecha_fin: null },
        select: {
          unidades: { select: { id: true, numero_propiedad: true } },
        },
      },
      usuarios: {
        where: { rol: "propietario", activo: true },
        select: { id: true, email: true, created_at: true },
      },
    },
  });

  const result = propietarios.map((p) => ({
    id: p.id,
    nombre: `${p.nombre} ${p.apellido}`,
    email_propietario: p.email,
    telefono: p.telefono,
    unidades: p.historial_propietarios.map((h) => ({
      id: h.unidades.id,
      numero_propiedad: h.unidades.numero_propiedad,
    })),
    usuario: p.usuarios[0]
      ? { id: p.usuarios[0].id, email: p.usuarios[0].email, created_at: p.usuarios[0].created_at }
      : null,
  }));

  res.json(result);
});

// POST /accesos — crear usuario propietario.
router.post("/", soloAdmin, async (req, res) => {
  const { id_propietario, email, password } = req.body ?? {};
  if (!id_propietario || !email?.trim() || !password?.trim()) {
    return res.status(400).json({ message: "id_propietario, email y password son requeridos" });
  }
  if (password.trim().length < 6) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
  }

  const complejoId = req.complejoId!;

  // Verify propietario exists and belongs to this complejo
  const prop = await prisma.propietarios.findFirst({
    where: { id: id_propietario, id_complejo: complejoId, activo: true },
    include: {
      historial_propietarios: {
        where: { fecha_fin: null },
        select: { id_unidad: true },
      },
      usuarios: {
        where: { rol: "propietario", activo: true },
        select: { id: true },
      },
    },
  });

  if (!prop) return res.status(404).json({ message: "Propietario no encontrado" });
  if (prop.usuarios.length > 0) return res.status(400).json({ message: "Este propietario ya tiene un acceso creado" });

  // Check email uniqueness
  const emailExists = await prisma.usuarios.findUnique({ where: { email: email.trim() } });
  if (emailExists) return res.status(400).json({ message: "El email ya está en uso por otro usuario" });

  // Validate: no unit already has another propietario user
  const unidadIds = prop.historial_propietarios.map((h) => h.id_unidad);
  if (unidadIds.length > 0) {
    const conflictos = await prisma.usuarios.findMany({
      where: {
        rol: "propietario",
        activo: true,
        id_propietario: { not: id_propietario },
        propietarios: {
          historial_propietarios: {
            some: { id_unidad: { in: unidadIds }, fecha_fin: null },
          },
        },
      },
      select: {
        propietarios: {
          select: {
            nombre: true,
            apellido: true,
            historial_propietarios: {
              where: { id_unidad: { in: unidadIds }, fecha_fin: null },
              select: { unidades: { select: { numero_propiedad: true } } },
            },
          },
        },
      },
    });

    if (conflictos.length > 0) {
      const detalle = conflictos.map((c) => {
        const p = c.propietarios!;
        const nums = p.historial_propietarios.map((h) => `#${h.unidades.numero_propiedad}`).join(", ");
        return `${p.nombre} ${p.apellido} ya tiene acceso a ${nums}`;
      });
      return res.status(400).json({
        message: `No se puede crear: ${detalle.join(". ")}. Solo puede haber un acceso por unidad.`,
      });
    }
  }

  const hash = await bcrypt.hash(password.trim(), 10);
  const user = await prisma.usuarios.create({
    data: {
      nombre: `${prop.nombre} ${prop.apellido}`,
      email: email.trim(),
      password_hash: hash,
      rol: "propietario",
      id_complejo: complejoId,
      id_propietario: id_propietario,
    },
  });

  res.status(201).json({ id: user.id, email: user.email });
});

// DELETE /accesos/:id — desactivar acceso propietario.
router.delete("/:id", soloAdmin, async (req, res) => {
  const user = await prisma.usuarios.findUnique({ where: { id: req.params.id } });
  if (!user || user.rol !== "propietario") {
    return res.status(404).json({ message: "Acceso no encontrado" });
  }

  await prisma.usuarios.update({
    where: { id: req.params.id },
    data: { activo: false },
  });

  res.json({ ok: true });
});

export default router;
