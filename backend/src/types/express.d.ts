import type { AccessPayload } from "../auth/jwt.js";

// Aumenta el Request de Express con el usuario autenticado y el complejo efectivo.
declare global {
  namespace Express {
    interface Request {
      user?: AccessPayload;
      complejoId?: string | null;
    }
  }
}

export {};
