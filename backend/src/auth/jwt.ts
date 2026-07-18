import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_SECRET ?? "dev_access_secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev_refresh_secret";
const ACCESS_EXPIRES = process.env.JWT_EXPIRES ?? "8h";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? "30d";

export type Rol = "superadmin" | "admin" | "lectura" | "directiva" | "propietario";

// Payload del access token (incluye id_complejo para multi-tenant).
export interface AccessPayload {
  sub: string; // id del usuario
  email: string;
  rol: Rol;
  id_complejo: string | null;
  id_propietario: string | null;
}

const accessOpts: jwt.SignOptions = {
  expiresIn: ACCESS_EXPIRES as jwt.SignOptions["expiresIn"],
};
const refreshOpts: jwt.SignOptions = {
  expiresIn: REFRESH_EXPIRES as jwt.SignOptions["expiresIn"],
};

export function signAccess(payload: AccessPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, accessOpts);
}

export function signRefresh(sub: string): string {
  return jwt.sign({ sub }, REFRESH_SECRET, refreshOpts);
}

export function verifyAccess(token: string): AccessPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessPayload;
}

export function verifyRefresh(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}
