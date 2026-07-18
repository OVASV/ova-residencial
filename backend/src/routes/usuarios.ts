import { Router } from "express";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { hashPassword } from "../auth/password.js";

const router = Router();
const soloSuper = requireRole("superadmin");

// Roles de staff que el superadministrador puede crear/gestionar (por ahora).
const ROLES_STAFF = ["admin", "directiva", "superadmin"] as const;
type RolStaff = (typeof ROLES_STAFF)[number];

const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function serialize(u: {
  id: string; nombre: string; email: string; rol: string; activo: boolean;
  id_complejo: string | null; created_at: Date; complejos?: { nombre: string } | null;
}) {
  return {
    id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo,
    id_complejo: u.id_complejo, nombre_complejo: u.complejos?.nombre ?? null, created_at: u.created_at,
  };
}

// GET /usuarios — staff del complejo activo + superadministradores (globales).
router.get("/", soloSuper, async (req, res) => {
  const idc = req.complejoId;
  const data = await prisma.usuarios.findMany({
    where: {
      rol: { in: [...ROLES_STAFF] },
      OR: [
        { rol: "superadmin" },
        ...(idc ? [{ id_complejo: idc }] : []),
      ],
    },
    orderBy: [{ activo: "desc" }, { rol: "asc" }, { nombre: "asc" }],
    include: { complejos: { select: { nombre: true } } },
  });
  res.json(data.map(serialize));
});

// POST /usuarios — crea un usuario de staff (admin/directiva → complejo activo; superadmin → global).
router.post("/", soloSuper, async (req, res) => {
  const { nombre, email, password, rol } = req.body ?? {};
  if (!nombre?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ message: "nombre, email y password son requeridos" });
  }
  if (!ROLES_STAFF.includes(rol)) {
    return res.status(400).json({ message: "rol inválido (admin, directiva o superadmin)" });
  }
  if (!emailValido(email.trim())) return res.status(400).json({ message: "email inválido" });
  if (String(password).length < 6) return res.status(400).json({ message: "la contraseña debe tener al menos 6 caracteres" });

  // admin y directiva pertenecen a un complejo; superadmin es global.
  let id_complejo: string | null = null;
  if (rol !== "superadmin") {
    if (!req.complejoId) return res.status(400).json({ message: "Selecciona un complejo activo para crear admin o directiva" });
    id_complejo = req.complejoId;
  }

  const existe = await prisma.usuarios.findUnique({ where: { email: email.trim() } });
  if (existe) return res.status(409).json({ message: "Ya existe un usuario con ese email" });

  const password_hash = await hashPassword(String(password));
  try {
    const creado = await prisma.usuarios.create({
      data: { nombre: nombre.trim(), email: email.trim(), password_hash, rol: rol as RolStaff, id_complejo },
      include: { complejos: { select: { nombre: true } } },
    });
    res.status(201).json(serialize(creado));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return res.status(409).json({ message: "Ya existe un usuario con ese email" });
    }
    throw e;
  }
});

// PUT /usuarios/:id — edita nombre/email/rol/activo y opcionalmente restablece la contraseña.
router.put("/:id", soloSuper, async (req, res) => {
  const target = await prisma.usuarios.findUnique({ where: { id: req.params.id } });
  if (!target || !ROLES_STAFF.includes(target.rol as RolStaff)) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }
  // Alcance: solo su propio complejo o superadmins globales.
  if (target.rol !== "superadmin" && req.complejoId && target.id_complejo !== req.complejoId) {
    return res.status(403).json({ message: "El usuario pertenece a otro complejo" });
  }

  const { nombre, email, rol, activo, password } = req.body ?? {};
  const esMismo = target.id === req.user?.sub;
  const data: Prisma.usuariosUpdateInput = {};

  if (nombre !== undefined) {
    if (!String(nombre).trim()) return res.status(400).json({ message: "nombre inválido" });
    data.nombre = String(nombre).trim();
  }
  if (email !== undefined) {
    if (!emailValido(String(email).trim())) return res.status(400).json({ message: "email inválido" });
    const otro = await prisma.usuarios.findUnique({ where: { email: String(email).trim() } });
    if (otro && otro.id !== target.id) return res.status(409).json({ message: "Ya existe un usuario con ese email" });
    data.email = String(email).trim();
  }
  if (rol !== undefined) {
    if (!ROLES_STAFF.includes(rol)) return res.status(400).json({ message: "rol inválido" });
    if (esMismo && rol !== target.rol) return res.status(400).json({ message: "No puedes cambiar tu propio rol" });
    // Un admin/directiva necesita complejo; un superadmin es global.
    if (rol === "superadmin") data.complejos = { disconnect: true };
    else if (target.id_complejo == null) {
      if (!req.complejoId) return res.status(400).json({ message: "Selecciona un complejo activo para asignar admin o directiva" });
      data.complejos = { connect: { id: req.complejoId } };
    }
    data.rol = rol;
  }
  if (activo !== undefined) {
    if (esMismo && activo === false) return res.status(400).json({ message: "No puedes desactivar tu propia cuenta" });
    data.activo = !!activo;
  }
  if (password !== undefined && password !== "") {
    if (String(password).length < 6) return res.status(400).json({ message: "la contraseña debe tener al menos 6 caracteres" });
    data.password_hash = await hashPassword(String(password));
  }

  const updated = await prisma.usuarios.update({
    where: { id: target.id }, data, include: { complejos: { select: { nombre: true } } },
  });
  res.json(serialize(updated));
});

// DELETE /usuarios/:id — desactiva (baja lógica) un usuario de staff.
router.delete("/:id", soloSuper, async (req, res) => {
  const target = await prisma.usuarios.findUnique({ where: { id: req.params.id } });
  if (!target || !ROLES_STAFF.includes(target.rol as RolStaff)) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }
  if (target.id === req.user?.sub) return res.status(400).json({ message: "No puedes desactivar tu propia cuenta" });
  if (target.rol !== "superadmin" && req.complejoId && target.id_complejo !== req.complejoId) {
    return res.status(403).json({ message: "El usuario pertenece a otro complejo" });
  }
  await prisma.usuarios.update({ where: { id: target.id }, data: { activo: false } });
  res.status(204).end();
});

export default router;
