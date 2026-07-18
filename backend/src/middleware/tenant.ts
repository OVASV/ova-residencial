import type { Request, Response, NextFunction } from "express";

// Resuelve el complejo "efectivo" de la petición (patrón multi-tenant, sección 16).
//
//  - admin / lectura: siempre su id_complejo del token. No pueden ver otros.
//  - superadmin: id_complejo = null (vista global) salvo que impersone un
//    complejo pasando el header X-Complejo-ID.
//
// Debe usarse DESPUÉS de requireAuth. Las rutas con datos por complejo deben
// filtrar siempre por req.complejoId.
export function resolveComplejo(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Token requerido" });

  if (user.rol === "superadmin") {
    req.complejoId = req.header("X-Complejo-ID") ?? null;
  } else {
    if (!user.id_complejo) {
      return res.status(403).json({ message: "Usuario sin complejo asignado" });
    }
    req.complejoId = user.id_complejo;
  }
  next();
}

// Igual que resolveComplejo pero exige un complejo concreto (no permite la
// vista global del superadmin). Útil en rutas que escriben datos de un complejo.
export function requireComplejo(req: Request, res: Response, next: NextFunction) {
  resolveComplejo(req, res, () => {
    if (!req.complejoId) {
      return res
        .status(400)
        .json({ message: "Complejo no especificado (header X-Complejo-ID requerido)" });
    }
    next();
  });
}
