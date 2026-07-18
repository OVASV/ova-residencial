import type { Request, Response, NextFunction } from "express";
import { verifyAccess, type Rol } from "../auth/jwt.js";

// Valida el JWT del header Authorization: Bearer <token> y adjunta req.user.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token requerido" });
  }
  try {
    req.user = verifyAccess(header.slice(7));
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
}

// Restringe el acceso a los roles indicados.
export function requireRole(...roles: Rol[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Token requerido" });
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ message: "Permiso denegado" });
    }
    next();
  };
}
