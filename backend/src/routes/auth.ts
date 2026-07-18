import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { verifyPassword } from "../auth/password.js";
import { signAccess, signRefresh, verifyRefresh, type AccessPayload, type Rol } from "../auth/jwt.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function buildPayload(user: {
  id: string;
  email: string;
  rol: string;
  id_complejo: string | null;
  id_propietario: string | null;
}): AccessPayload {
  return { sub: user.id, email: user.email, rol: user.rol as Rol, id_complejo: user.id_complejo, id_propietario: user.id_propietario };
}

// POST /api/v1/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ message: "email y password son requeridos" });
  }
  const user = await prisma.usuarios.findUnique({
    where: { email },
    include: { complejos: { select: { nombre: true, logo_url: true } } },
  });
  if (!user || !user.activo) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }
  res.json({
    token: signAccess(buildPayload(user)),
    refreshToken: signRefresh(user.id),
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      id_complejo: user.id_complejo,
      id_propietario: user.id_propietario,
      nombre_complejo: user.complejos?.nombre ?? null,
      logo_url: user.complejos?.logo_url ?? null,
    },
  });
});

// POST /api/v1/auth/refresh
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) {
    return res.status(400).json({ message: "refreshToken requerido" });
  }
  try {
    const { sub } = verifyRefresh(refreshToken);
    const user = await prisma.usuarios.findUnique({ where: { id: sub } });
    if (!user || !user.activo) {
      return res.status(401).json({ message: "Usuario no válido" });
    }
    res.json({ token: signAccess(buildPayload(user)) });
  } catch {
    return res.status(401).json({ message: "Refresh token inválido o expirado" });
  }
});

// POST /api/v1/auth/logout — JWT stateless: el cliente descarta los tokens.
router.post("/logout", (_req, res) => {
  res.json({ message: "Sesión cerrada" });
});

// GET /api/v1/auth/me — datos del usuario autenticado.
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.usuarios.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, nombre: true, email: true, rol: true, id_complejo: true, id_propietario: true, activo: true, complejos: { select: { nombre: true, logo_url: true } } },
  });
  if (!user) return res.status(404).json({ message: "No encontrado" });
  res.json({ ...user, nombre_complejo: user.complejos?.nombre ?? null, logo_url: user.complejos?.logo_url ?? null });
});

export default router;
