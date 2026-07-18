import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Rol = "superadmin" | "admin" | "lectura" | "directiva" | "propietario";

export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  id_complejo: string | null;
  id_propietario: string | null;
  nombre_complejo: string | null;
  logo_url: string | null;
}

export interface ComplejoActivo {
  id: string;
  nombre: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  // Complejo activo para superadmin (multiempresa). Para admin/lectura se usa
  // el id_complejo del token y este campo se ignora.
  complejoActivo: ComplejoActivo | null;
  setSession: (s: { token: string; refreshToken: string; user: AuthUser }) => void;
  setComplejoActivo: (c: ComplejoActivo | null) => void;
  logout: () => void;
}

// Sesión persistida en localStorage (clave: lospinos-auth).
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      complejoActivo: null,
      setSession: ({ token, refreshToken, user }) => set({ token, refreshToken, user }),
      setComplejoActivo: (complejoActivo) => set({ complejoActivo }),
      logout: () => set({ token: null, refreshToken: null, user: null, complejoActivo: null }),
    }),
    { name: "lospinos-auth" }
  )
);
