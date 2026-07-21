// Cliente HTTP centralizado. Base /api/v1 (resuelta vía proxy de Vite al backend).
// Adjunta el JWT desde el store y maneja 401 cerrando la sesión.
import { useAuth, type AuthUser } from "../stores/authStore";

const BASE = "/api/v1";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { token, user, complejoActivo } = useAuth.getState();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Superadmin (multiempresa): opera sobre el complejo activo seleccionado.
  // Admin/lectura usan el id_complejo de su token (no requieren header).
  if (user?.rol === "superadmin" && complejoActivo) {
    headers["X-Complejo-ID"] = complejoActivo.id;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    useAuth.getState().logout();
    throw new Error("Sesión expirada");
  }
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.message ?? `${options.method ?? "GET"} ${path} → ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

export const apiGet = <T>(path: string) => request<T>(path);
export const apiPost = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const apiDelete = (path: string) => request<void>(path, { method: "DELETE" });

// Subida de archivos (multipart). No fija Content-Type: el navegador pone el boundary.
async function uploadArchivo<T>(path: string, file: File): Promise<T> {
  const { token, user } = useAuth.getState();
  const fd = new FormData();
  fd.append("archivo", file);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (user?.rol === "superadmin" && user.id_complejo) headers["X-Complejo-ID"] = user.id_complejo;
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: fd, headers });
  if (res.status === 401) {
    useAuth.getState().logout();
    throw new Error("Sesión expirada");
  }
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.message ?? `POST ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---- Tipos de dominio ----
export interface Pais {
  id: number;
  codigo_iso2: string;
  codigo_iso3: string;
  nombre: string;
  nombre_en: string | null;
  activo: boolean;
}

export interface HealthResponse {
  status: string;
  db: string;
  timestamp: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

// ---- Endpoints ----
export const getPaises = () => apiGet<Pais[]>("/paises");
export const getHealth = () => apiGet<HealthResponse>("/health");
export const login = (email: string, password: string) =>
  apiPost<LoginResponse>("/auth/login", { email, password });

// ---- Propietarios / Unidades (Sprint 2) ----
export interface Propietario {
  id: string;
  nombre: string;
  apellido: string;
  dpi_nit: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  id_pais: number | null;
  activo: boolean;
  paises?: { id: number; nombre: string; codigo_iso2: string } | null;
  historial_propietarios: { id_unidad: string; fecha_inicio: string; unidades?: { numero_propiedad: string | null } | null }[];
}

export interface PropietarioActual {
  id: string;
  nombre: string;
  apellido: string;
  desde: string;
}

export interface Unidad {
  id: string;
  numero_propiedad: string | null;
  id_bloque: string | null;
  id_calle: string | null;
  id_piso: string | null;
  bloque: string | null;
  calle: string | null;
  area_m2: string | number | null;
  num_piso: number | null;
  piso: string | null;
  lat: string | number | null;
  lng: string | number | null;
  activo: boolean;
  estado_actual: { id: string; nombre: string } | null;
  propietario_actual: PropietarioActual | null;
}

export interface Catalogo {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface HistorialEstadoItem {
  id: string;
  id_unidad: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  estados_unidad: { id: string; nombre: string };
}

export interface HistorialItem {
  id: string;
  id_unidad: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  motivo: string | null;
  propietarios: { id: string; nombre: string; apellido: string };
}

export interface NuevoPropietarioPayload {
  nombre: string;
  apellido: string;
  dpi_nit?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  id_pais?: number | null;
  fecha_registro?: string;
  activo?: boolean;
  asignacion?: { id_unidad: string; fecha_inicio: string; motivo?: string };
}

export interface NuevaUnidadPayload {
  id_bloque: string;
  id_calle: string;
  id_piso?: string | null;
  numero_propiedad: string;
  area_m2?: number | null;
  num_piso?: number | null;
  lat?: number | null;
  lng?: number | null;
}

export interface EditarPropietarioPayload {
  nombre?: string;
  apellido?: string;
  dpi_nit?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  id_pais?: number | null;
  activo?: boolean;
}

export const getPropietarios = (q?: string) =>
  apiGet<Propietario[]>(`/propietarios${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const createPropietario = (payload: NuevoPropietarioPayload) =>
  apiPost<Propietario>("/propietarios", payload);
export const updatePropietario = (id: string, patch: EditarPropietarioPayload) =>
  apiPut<Propietario>(`/propietarios/${id}`, patch);
export const deletePropietario = (id: string) => apiDelete(`/propietarios/${id}`);

export interface EditarUnidadPayload {
  id_bloque?: string;
  id_calle?: string;
  id_piso?: string | null;
  numero_propiedad?: string;
  area_m2?: number | null;
  num_piso?: number | null;
  activo?: boolean;
  lat?: number | null;
  lng?: number | null;
}

export const getUnidades = () => apiGet<Unidad[]>("/unidades");
export const createUnidad = (payload: NuevaUnidadPayload) =>
  apiPost<Unidad>("/unidades", payload);
export const updateUnidad = (id: string, patch: EditarUnidadPayload) =>
  apiPut<Unidad>(`/unidades/${encodeURIComponent(id)}`, patch);
export const getHistorialUnidad = (idUnidad: string) =>
  apiGet<HistorialItem[]>(`/unidades/${encodeURIComponent(idUnidad)}/historial`);
export const asignarPropietario = (
  idUnidad: string,
  payload: { id_propietario: string; fecha_inicio: string; motivo?: string }
) => apiPost<HistorialItem>(`/unidades/${encodeURIComponent(idUnidad)}/propietario`, payload);

export const asignarEstadoUnidad = (
  idUnidad: string,
  payload: { id_estado: string; fecha_inicio: string }
) => apiPost<HistorialEstadoItem>(`/unidades/${encodeURIComponent(idUnidad)}/estado`, payload);
export const getHistorialEstadoUnidad = (idUnidad: string) =>
  apiGet<HistorialEstadoItem[]>(`/unidades/${encodeURIComponent(idUnidad)}/historial-estado`);

// ---- Configuración: estados de unidad y tarifas (Sprint 3) ----
export interface EstadoUnidad {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface Cuota {
  id: string;
  concepto: string;
  monto: string | number;
  moneda: string;
  tipo: "fijo" | "variable";
  id_estado_unidad: string | null;
  periodicidad: string;
  aplica_auto: boolean;
  aplica_desde: string;
  aplica_hasta: string | null;
  activo: boolean;
  estados_unidad?: { id: string; nombre: string } | null;
}

export interface CuotaPayload {
  concepto: string;
  monto: number;
  tipo: "fijo" | "variable";
  id_estado_unidad: string | null;
  periodicidad: string;
  aplica_auto: boolean;
}

// ---- Cargos / facturación (Sprint 3) ----
export interface Cargo {
  id: string;
  id_unidad: string;
  id_cuota: string | null;
  concepto: string;
  periodo_mes: string;
  monto: string | number;
  saldo: string | number;
  estado: "pendiente" | "parcial" | "pagado" | "anulado";
  fecha_vencimiento: string | null;
}

export interface GrupoConcepto {
  concepto: string;
  cantidad: number;
  total: number;
  unidades: string[];
}

export interface FilaPropiedad {
  id: string;
  numero_propiedad: string | null;
  calle: string | null;
  bloque: string | null;
  tipo: string | null;
  propietario: string | null;
  conceptos: { concepto: string; monto: number }[];
  total: number;
}

export interface GenerarResultado {
  periodo: string;
  creados: number;
  total_monto: number;
  unidades_procesadas: number;
  por_concepto: GrupoConcepto[];
  por_propiedad: FilaPropiedad[];
  sin_categoria: string[];
}

export interface GenerarPreview {
  periodo: string;
  preview: true;
  total_cargos: number;
  total_monto: number;
  unidades_procesadas: number;
  por_concepto: GrupoConcepto[];
  por_propiedad: FilaPropiedad[];
  sin_categoria: string[];
}

export type MetodoPago = "transferencia" | "efectivo" | "cheque";

export interface Pago {
  id: string;
  id_unidad: string;
  fecha_pago: string;
  monto_total: string | number;
  metodo: MetodoPago;
  banco_origen: string | null;
  referencia_banco: string | null;
  descripcion?: string | null;
  estado: "registrado" | "conciliado" | "anulado";
  comprobante_url?: string | null;
  comprobante_nombre?: string | null;
  comprobante_tipo?: string | null;
  pago_cargos?: { monto_aplicado: string | number; cargos: { concepto: string; periodo_mes: string } }[];
}

export interface RegistrarPagoPayload {
  id_unidad: string;
  fecha_pago: string;
  metodo: MetodoPago;
  monto_total?: number;
  banco_origen?: string;
  referencia_banco?: string;
  descripcion?: string;
  aplicaciones?: { id_cargo: string; monto_aplicado?: number }[];
}
export const editarPago = (id: string, data: { descripcion?: string; referencia_banco?: string; banco_origen?: string }) =>
  apiPatch<Pago>(`/pagos/${id}`, data);

export interface EstadoCuenta {
  nombre_complejo?: string;
  logo_url?: string | null;
  unidad: {
    id: string;
    numero_propiedad: string | null;
    bloque: string;
    calle: string | null;
    area_m2: string | number | null;
    estado_actual: { id: string; nombre: string } | null;
    propietario_actual:
      | { id: string; nombre: string; apellido: string; telefono: string | null; email: string | null; desde: string }
      | null;
  };
  kpis: {
    saldo_pendiente: number;
    credito_a_favor: number;
    total_pagado_anio: number;
    total_historico: number;
    ultimo_pago: string | null;
  };
  cargos: Cargo[];
  pagos: Pago[];
}

// ---- Mapa del complejo ----
export type NivelMapa = "al_dia" | "a_favor" | "mayor_1000" | "500_1000" | "100_500" | "menor_100";

export interface UnidadMapa {
  id: string;
  numero_propiedad: string | null;
  bloque: string;
  calle: string | null;
  lat: string | number | null;
  lng: string | number | null;
  estado_actual: { id: string; nombre: string } | null;
  propietario_actual: { id: string; nombre: string; apellido: string; telefono: string | null } | null;
  cuota_mensual: number;
  saldo_pendiente: number;
  meses_atraso: number;
  nivel: NivelMapa;
}

export const getMapaUnidades = () => apiGet<UnidadMapa[]>("/unidades/mapa");
export const updateUnidadCoords = (id: string, coords: { lat: number; lng: number }) =>
  apiPut<Unidad>(`/unidades/${encodeURIComponent(id)}`, coords);

export const getEstadoCuenta = (idUnidad: string) =>
  apiGet<EstadoCuenta>(`/unidades/${encodeURIComponent(idUnidad)}/estado-cuenta`);

export const getCargosPendientes = (idUnidad: string) =>
  apiGet<Cargo[]>(`/cargos/pendientes?id_unidad=${encodeURIComponent(idUnidad)}`);
export const getPagos = (periodo: string) =>
  apiGet<Pago[]>(`/pagos?periodo=${encodeURIComponent(periodo)}`);
export const registrarPago = (payload: RegistrarPagoPayload) => apiPost<Pago>("/pagos", payload);
export const anularPago = (id: string) =>
  apiPatch<{ message: string }>(`/pagos/${id}/anular`, {});

export interface ReciboItem {
  id: string;
  fecha_pago: string;
  monto_total: string | number;
  metodo: MetodoPago;
  banco_origen: string | null;
  referencia_banco: string | null;
  estado: string;
  numero_propiedad: string | null;
  bloque: string | null;
  calle: string | null;
  propietario: string | null;
  email: string | null;
  telefono: string | null;
  descripcion: string | null;
  tipo: string | null;
  conceptos: string;
  cuota_asignada: { concepto: string; monto: string | number; tipo_propiedad: string | null } | null;
  justificacion_traslado: string | null;
  pago_cargos: { concepto: string; periodo_mes: string; monto_aplicado: string | number; monto_cargo: string | number }[];
}
export interface RecibosResponse {
  nombre_complejo: string | null;
  logo_url: string | null;
  periodo: { anio: number; mes: number } | null;
  recibos: ReciboItem[];
}
export const getRecibos = (anio?: string, mes?: string) => {
  const qs = new URLSearchParams();
  if (anio) qs.set("anio", anio);
  if (mes) qs.set("mes", mes);
  const q = qs.toString();
  return apiGet<RecibosResponse>(`/pagos/recibos${q ? `?${q}` : ""}`);
};
export const getRecibosByIds = (ids: string[]) =>
  apiGet<RecibosResponse>(`/pagos/recibos?ids=${encodeURIComponent(ids.join(","))}`);
export const enviarReciboEmail = (id: string, to?: string) =>
  apiPost<{ ok: boolean; message: string }>(`/pagos/${id}/enviar-recibo`, to ? { to } : {});
export const getReciboPdfLink = (id: string) =>
  apiPost<{ url: string }>(`/pagos/${id}/recibo-pdf-link`, {});
export const subirComprobantePago = (id: string, file: File) =>
  uploadArchivo<Pago>(`/pagos/${id}/comprobante`, file);
export const quitarComprobantePago = (id: string) => apiDelete(`/pagos/${id}/comprobante`);
export const subirComprobanteGasto = (id: string, file: File) =>
  uploadArchivo<Gasto>(`/gastos/${id}/comprobante`, file);
export const quitarComprobanteGasto = (id: string) => apiDelete(`/gastos/${id}/comprobante`);

// ---- Conciliación bancaria (Sprint 4) ----
export type TipoMatch = "conciliado" | "diferencia" | "sin_match_banco";
export type EstadoConciliacion = "borrador" | "en_revision" | "confirmada" | "anulada";

export interface PagoSimple {
  id: string;
  id_unidad: string;
  monto_total: string | number;
  referencia_banco: string | null;
  fecha_pago: string;
  metodo: MetodoPago;
}

export interface ConciliacionLinea {
  id: string;
  fecha_mov: string | null;
  monto: string | number;
  referencia: string | null;
  descripcion: string | null;
  tipo_match: TipoMatch;
  id_pago: string | null;
  pagos: PagoSimple | null;
}

export interface Conciliacion {
  id: string;
  id_complejo: string;
  periodo: string;
  banco: string | null;
  archivo_nombre: string | null;
  estado: EstadoConciliacion;
  total_banco: string | number | null;
  total_sistema: string | number | null;
  confirmado_at: string | null;
  created_at: string;
  conciliacion_lineas: ConciliacionLinea[];
  sin_match_sistema: PagoSimple[];
  resumen: { conciliado: number; diferencia: number; sin_match_banco: number; sin_match_sistema: number };
}

export interface ConciliacionListItem {
  id: string;
  periodo: string;
  banco: string | null;
  archivo_nombre: string | null;
  estado: EstadoConciliacion;
  total_banco: string | number | null;
  total_sistema: string | number | null;
  created_at: string;
  _count: { conciliacion_lineas: number };
}

export interface LineaBanco {
  fecha_mov?: string;
  monto: number;
  referencia?: string;
  descripcion?: string;
}

export const getConciliaciones = (periodo?: string) =>
  apiGet<ConciliacionListItem[]>(`/conciliaciones${periodo ? `?periodo=${periodo}` : ""}`);
export const getConciliacion = (id: string) => apiGet<Conciliacion>(`/conciliaciones/${id}`);
export const crearConciliacion = (payload: {
  periodo: string;
  banco?: string;
  archivo_nombre?: string;
  lineas: LineaBanco[];
}) => apiPost<Conciliacion>("/conciliaciones", payload);
export const matchLinea = (id: string, payload: { id_linea: string; id_pago: string | null }) =>
  apiPost<Conciliacion>(`/conciliaciones/${id}/match`, payload);
export const confirmarConciliacion = (id: string) =>
  apiPost<Conciliacion>(`/conciliaciones/${id}/confirmar`, {});
export const anularConciliacion = (id: string) =>
  apiPatch<Conciliacion>(`/conciliaciones/${id}/anular`, {});
export const deleteConciliacion = (id: string) => apiDelete(`/conciliaciones/${id}`);

export const getCargos = (periodo: string, idUnidad?: string) =>
  apiGet<Cargo[]>(`/cargos?periodo=${encodeURIComponent(periodo)}${idUnidad ? `&id_unidad=${idUnidad}` : ""}`);
export const generarCargosPreview = (periodo: string) =>
  apiPost<GenerarPreview>("/cargos/generar", { periodo, preview: true });
export const generarCargos = (periodo: string) =>
  apiPost<GenerarResultado>("/cargos/generar", { periodo });
export const addCargo = (payload: { id_unidad: string; periodo: string; concepto: string; monto: number }) =>
  apiPost<Cargo>("/cargos", payload);
export const deleteCargo = (id: string) => apiDelete(`/cargos/${id}`);

// ---- Dashboard (Sprint 3) ----
export interface ResumenDashboard {
  periodo: string;
  kpis: {
    cobrado_mes: number; esperado_mes: number;
    cobrado_acum: number; esperado_acum: number;
    pendiente_mes: number; pendiente_acum: number;
    gastos_mes: number; gastos_anio: number;
    presupuesto_mes: number; presupuesto_anio: number;
  };
  distribucion: { pagado: number; pendiente: number };
  pagos_recientes: {
    id: string;
    id_unidad: string;
    numero_propiedad: string | null;
    propietario: string | null;
    categoria: string | null;
    fecha_pago: string;
    monto_total: string | number;
    metodo: string;
    conceptos: string;
  }[];
  estado_por_unidad: {
    id: string;
    numero_propiedad: string | null;
    bloque: string;
    calle: string | null;
    propietario: string | null;
    saldo: string | number;
    estado: "pagado" | "pendiente" | "atrasado" | "sin_cargos" | "a_favor";
  }[];
}

export const getResumenDashboard = (periodo?: string) =>
  apiGet<ResumenDashboard>(`/dashboard/resumen${periodo ? `?periodo=${periodo}` : ""}`);

export interface EficienciaMes {
  periodo: string;
  esperado: number;
  cobrado: number;
  pendiente: number;
  recaudado: number;
  eficiencia: number;
}

export const getEficienciaCobros = (meses = 13, periodo?: string) =>
  apiGet<EficienciaMes[]>(`/dashboard/eficiencia?meses=${meses}${periodo ? `&periodo=${periodo}` : ""}`);

export interface ProyeccionFlujo {
  periodo: string;
  label_ancla: string;
  caja_inicial: number;
  facturacion_mensual: number;
  tasa_cobro: number;
  ingreso_mensual: number;
  gasto_mensual: number;
  flujo_neto: number;
  mes_negativo: string | null;
  mora_actual: number;
  tasa_recuperacion: number;
  historico: { periodo: string; label: string; caja_fin: number }[];
  proyeccion: { periodo: string; label: string; ingreso: number; egreso: number; caja_fin: number; recuperacion_mora: number; caja_con_mora: number }[];
}
export const getProyeccionFlujo = (meses = 6, periodo?: string) =>
  apiGet<ProyeccionFlujo>(`/dashboard/proyeccion?meses=${meses}${periodo ? `&periodo=${periodo}` : ""}`);

export interface MovimientoCaja {
  fecha: string;
  tipo: "pago" | "gasto";
  descripcion: string;
  detalle: string | null;
  ingreso: number;
  egreso: number;
  saldo: number;
}
export interface LibroCaja {
  periodo: string;
  nombre_complejo: string;
  logo_url: string | null;
  saldo_inicial: number;
  total_ingresos: number;
  total_egresos: number;
  saldo_final: number;
  movimientos: MovimientoCaja[];
}
export const getLibroCaja = (periodo: string) =>
  apiGet<LibroCaja>(`/dashboard/movimientos?periodo=${periodo}`);

// ===== Cierres de período =====
export interface CierrePeriodo {
  periodo: string;
  cerrado: boolean;
  saldo_final: number | null;
  cerrado_por: string | null;
  cerrado_at: string | null;
  reabierto_por: string | null;
  reabierto_at: string | null;
  reabierto_solicitado_por: string | null;
  reabierto_motivo: string | null;
  comprobante_url: string | null;
  comprobante_nombre: string | null;
}
// ===== Usuarios de staff (solo superadmin) =====
export type RolStaff = "admin" | "directiva" | "superadmin";
export interface UsuarioStaff {
  id: string;
  nombre: string;
  email: string;
  rol: RolStaff;
  activo: boolean;
  id_complejo: string | null;
  nombre_complejo: string | null;
  created_at: string;
}
export interface UsuarioStaffPayload {
  nombre: string;
  email: string;
  password?: string;
  rol: RolStaff;
  activo?: boolean;
}
export const getUsuariosStaff = () => apiGet<UsuarioStaff[]>(`/usuarios`);
export const crearUsuarioStaff = (p: UsuarioStaffPayload) => apiPost<UsuarioStaff>(`/usuarios`, p);
export const actualizarUsuarioStaff = (id: string, p: Partial<UsuarioStaffPayload>) =>
  apiPut<UsuarioStaff>(`/usuarios/${id}`, p);
export const desactivarUsuarioStaff = (id: string) => apiDelete(`/usuarios/${id}`);

export const getCierres = () => apiGet<CierrePeriodo[]>(`/cierres`);
// Cierre con comprobante bancario obligatorio (multipart: periodo + archivo PDF).
export async function cerrarPeriodo(periodo: string, file: File) {
  const { token, user, complejoActivo } = useAuth.getState();
  const fd = new FormData();
  fd.append("periodo", periodo);
  fd.append("archivo", file);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (user?.rol === "superadmin" && complejoActivo) headers["X-Complejo-ID"] = complejoActivo.id;
  const res = await fetch(`${BASE}/cierres`, { method: "POST", body: fd, headers });
  if (res.status === 401) { useAuth.getState().logout(); throw new Error("Sesión expirada"); }
  if (!res.ok) { const m = await res.json().catch(() => ({})); throw new Error(m.message ?? "No se pudo cerrar el período"); }
  return res.json() as Promise<{ periodo: string; cerrado: boolean; email: { sent: number; configured: boolean } }>;
}
export const reabrirPeriodo = (periodo: string, datos: { solicitado_por: string; motivo: string }) =>
  apiPost<{ periodo: string; cerrado: boolean }>(`/cierres/${periodo}/reabrir`, datos);
// Sube/reemplaza el comprobante bancario aunque el mes esté cerrado (no toca la data contable).
export async function subirComprobanteCierre(periodo: string, file: File) {
  const { token, user, complejoActivo } = useAuth.getState();
  const fd = new FormData();
  fd.append("archivo", file);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (user?.rol === "superadmin" && complejoActivo) headers["X-Complejo-ID"] = complejoActivo.id;
  const res = await fetch(`${BASE}/cierres/${periodo}/comprobante`, { method: "PUT", body: fd, headers });
  if (res.status === 401) { useAuth.getState().logout(); throw new Error("Sesión expirada"); }
  if (!res.ok) { const m = await res.json().catch(() => ({})); throw new Error(m.message ?? "No se pudo subir el comprobante"); }
  return res.json() as Promise<{ periodo: string; comprobante_url: string; comprobante_nombre: string }>;
}

export type RangoDeuda = "mayor_1000" | "500_1000" | "100_500" | "menor_100" | "a_favor";

export interface RangoDeudaInfo {
  key: RangoDeuda;
  label: string;
  min: number;
  max: number | null;
  total: number;
  cantidad: number;
}

export interface PropiedadDeuda {
  id: string;
  numero_propiedad: string | null;
  bloque: string | null;
  calle: string | null;
  categoria: string | null;
  propietario: string | null;
  telefono: string | null;
  email: string | null;
  saldo: number;
  rango: RangoDeuda;
}

export interface SegmentacionDeuda {
  rangos: RangoDeudaInfo[];
  propiedades: PropiedadDeuda[];
}

export const getSegmentacionDeuda = (periodo?: string) => apiGet<SegmentacionDeuda>(`/dashboard/segmentacion-deuda${periodo ? `?periodo=${periodo}` : ""}`);

// ---- Avisos (Sprint 6) ----
export type TipoAviso = "recordatorio_pago" | "aviso_mora" | "mantenimiento" | "reunion" | "general";
export type CanalAviso = "whatsapp" | "email" | "ambos";
export type FiltroDest = "todos" | "pendientes" | "atrasados" | "unidad";

export interface Destinatario {
  id_unidad: string;
  numero_propiedad: string | null;
  id_propietario: string | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  area: number | null;
  saldo: number;
  meses_mora: number;
  total_mora: number;
  cuota_mensual: number;
}

export interface AvisoResumen {
  id: string;
  tipo: TipoAviso;
  asunto: string | null;
  mensaje: string;
  canal: CanalAviso;
  estado: "borrador" | "programado" | "enviado" | "cancelado";
  total_envios: number;
  total_entregados: number;
  total_abiertos: number;
  programado_at: string | null;
  enviado_at: string | null;
  created_at: string;
}

export interface AvisosHistorial {
  stats: { total_enviados: number; tasa_entrega: number; tasa_apertura: number };
  avisos: AvisoResumen[];
}

export interface NuevoAvisoPayload {
  tipo: TipoAviso;
  asunto?: string;
  mensaje: string;
  canal: CanalAviso;
  filtro: FiltroDest;
  id_unidad?: string;
  id_unidades?: string[];
  programado_at?: string;
  guardar_borrador?: boolean;
  incluir_estado_cuenta?: boolean;
}

export const getDestinatarios = (filtro: FiltroDest, idUnidad?: string) =>
  apiGet<{ total: number; destinatarios: Destinatario[] }>(
    `/avisos/destinatarios?filtro=${filtro}${idUnidad ? `&id_unidad=${encodeURIComponent(idUnidad)}` : ""}`
  );
export const getAvisos = () => apiGet<AvisosHistorial>("/avisos");
export const createAviso = (payload: NuevoAvisoPayload) => apiPost<AvisoResumen>("/avisos", payload);

// ---- Gastos y presupuesto (Sprint 5) ----
export type CategoriaGasto =
  | "seguridad"
  | "limpieza"
  | "mantenimiento"
  | "servicios"
  | "administrativo"
  | "extraordinario"
  | "planilla"
  | "ajuste";

export interface Gasto {
  id: string;
  categoria: CategoriaGasto;
  descripcion: string;
  proveedor: string | null;
  no_factura: string | null;
  monto: string | number;
  fecha: string;
  metodo: string | null;
  periodo_mes: string;
  id_item?: string | null;
  item_nombre?: string | null;
  comprobante_url?: string | null;
  comprobante_nombre?: string | null;
  comprobante_tipo?: string | null;
}

export interface NuevoGastoPayload {
  categoria: CategoriaGasto;
  descripcion: string;
  proveedor?: string;
  no_factura?: string;
  monto: number;
  fecha: string;
  metodo?: string;
  id_item?: string | null;
}

export interface ResumenGastos {
  nombre_complejo: string | null;
  logo_url: string | null;
  periodo: string;
  periodo_anterior: string;
  desde: string | null;
  kpis: {
    total_gastado: number;
    total_presupuesto: number;
    disponible: number;
    num_transacciones: number;
    variacion_pct: number | null;
  };
  categorias: {
    categoria: CategoriaGasto;
    presupuestado: number;
    ejecutado: number;
    disponible: number;
    pct: number;
    alerta: boolean;
  }[];
}

export interface PresupuestoItem {
  id_item: string;
  categoria: CategoriaGasto;
  nombre: string;
  descripcion: string;
  monto: string | number;
}

export interface ItemPresupuesto {
  id: string;
  categoria: CategoriaGasto;
  nombre: string;
  activo: boolean;
}

export const getGastos = (periodo: string, categoria?: string, desde?: string) =>
  apiGet<Gasto[]>(`/gastos?periodo=${encodeURIComponent(periodo)}${categoria ? `&categoria=${categoria}` : ""}${desde ? `&desde=${encodeURIComponent(desde)}` : ""}`);
export const createGasto = (payload: NuevoGastoPayload) => apiPost<Gasto>("/gastos", payload);
export const updateGasto = (id: string, payload: Partial<NuevoGastoPayload>) => apiPut<Gasto>(`/gastos/${id}`, payload);
export const deleteGasto = (id: string) => apiDelete(`/gastos/${id}`);
export const getResumenGastos = (periodo: string, desde?: string) =>
  apiGet<ResumenGastos>(`/gastos/resumen-mensual?periodo=${encodeURIComponent(periodo)}${desde ? `&desde=${encodeURIComponent(desde)}` : ""}`);
export const getPresupuesto = (periodo: string) =>
  apiGet<PresupuestoItem[]>(`/gastos/presupuesto?periodo=${encodeURIComponent(periodo)}`);
export const setPresupuesto = (periodo: string, idItem: string, monto: number, descripcion?: string) =>
  apiPut<unknown>("/gastos/presupuesto", { periodo, id_item: idItem, monto, descripcion });
export const copiarPresupuesto = (origen: string, destino: string) =>
  apiPost<{ creados: number; actualizados: number }>("/gastos/presupuesto/copiar", { origen, destino });

// Catálogo de items de presupuesto (Configuración)
export const getItemsPresupuesto = () => apiGet<ItemPresupuesto[]>("/config/items-presupuesto");
export const createItemPresupuesto = (categoria: CategoriaGasto, nombre: string) =>
  apiPost<ItemPresupuesto>("/config/items-presupuesto", { categoria, nombre });
export const updateItemPresupuesto = (id: string, patch: { nombre?: string; categoria?: CategoriaGasto; activo?: boolean }) =>
  apiPut<ItemPresupuesto>(`/config/items-presupuesto/${id}`, patch);
export const deleteItemPresupuesto = (id: string) => apiDelete(`/config/items-presupuesto/${id}`);

// ---- Complejo (proyecto) + catálogos geográficos ----
export interface GeoItem {
  Id: number;
  Nombre: string;
}

export interface ComplejoInfo {
  id: string;
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  logo_url: string | null;
  id_pais_geo: number | null;
  id_departamento: number | null;
  id_municipio: number | null;
  pais: GeoItem | null;
  departamento: GeoItem | null;
  municipio: GeoItem | null;
}

export interface ComplejoPayload {
  nombre?: string;
  ciudad?: string | null;
  direccion?: string | null;
  id_pais_geo?: number | null;
  id_departamento?: number | null;
  id_municipio?: number | null;
}

// Multiempresa: gestión de varios complejos (superadmin).
export interface ComplejoListItem {
  id: string;
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  logo_url: string | null;
  activo: boolean;
  _count: { unidades: number; propietarios: number; usuarios: number };
}

export const getComplejos = () => apiGet<ComplejoListItem[]>("/complejos");
export const createComplejo = (payload: { nombre: string; ciudad?: string; direccion?: string }) =>
  apiPost<{ id: string; nombre: string }>("/complejos", payload);
export const updateComplejoGlobal = (id: string, patch: { nombre?: string; ciudad?: string | null; activo?: boolean }) =>
  apiPut<unknown>(`/complejos/${id}`, patch);
export const uploadLogoComplejo = async (id: string, file: File): Promise<{ logo_url: string }> => {
  const fd = new FormData();
  fd.append("logo", file);
  const { token } = useAuth.getState();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/complejos/${id}/logo`, { method: "POST", body: fd, headers });
  if (!res.ok) { const msg = await res.json().catch(() => ({})); throw new Error(msg.message ?? "Error al subir logo"); }
  return res.json();
};
export const deleteLogoComplejo = (id: string) => apiDelete(`/complejos/${id}/logo`);

export const getComplejo = () => apiGet<ComplejoInfo>("/complejo");
export const updateComplejo = (payload: ComplejoPayload) => apiPut<ComplejoInfo>("/complejo", payload);
export const uploadLogoProyecto = async (file: File): Promise<{ logo_url: string }> => {
  const fd = new FormData();
  fd.append("logo", file);
  const { token, user, complejoActivo } = useAuth.getState();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (user?.rol === "superadmin" && complejoActivo) headers["X-Complejo-ID"] = complejoActivo.id;
  const res = await fetch(`${BASE}/complejo/logo`, { method: "POST", body: fd, headers });
  if (!res.ok) { const msg = await res.json().catch(() => ({})); throw new Error(msg.message ?? "Error al subir logo"); }
  return res.json();
};
export const deleteLogoProyecto = () => apiDelete("/complejo/logo");
export const getGeoPaises = () => apiGet<GeoItem[]>("/complejo/geo/paises");
export const getGeoDepartamentos = (idPais: number) =>
  apiGet<GeoItem[]>(`/complejo/geo/departamentos?id_pais=${idPais}`);
export const getGeoMunicipios = (idDepto: number) =>
  apiGet<GeoItem[]>(`/complejo/geo/municipios?id_departamento=${idDepto}`);

// Bloques y calles (catálogos del complejo)
export const getBloques = () => apiGet<Catalogo[]>("/config/bloques");
export const createBloque = (nombre: string) => apiPost<Catalogo>("/config/bloques", { nombre });
export const updateBloque = (id: string, patch: Partial<Catalogo>) => apiPut<Catalogo>(`/config/bloques/${id}`, patch);
export const deleteBloque = (id: string) => apiDelete(`/config/bloques/${id}`);
export const getCalles = () => apiGet<Catalogo[]>("/config/calles");
export const createCalle = (nombre: string) => apiPost<Catalogo>("/config/calles", { nombre });
export const updateCalle = (id: string, patch: Partial<Catalogo>) => apiPut<Catalogo>(`/config/calles/${id}`, patch);
export const deleteCalle = (id: string) => apiDelete(`/config/calles/${id}`);
export const getPisos = () => apiGet<Catalogo[]>("/config/pisos");
export const createPiso = (nombre: string) => apiPost<Catalogo>("/config/pisos", { nombre });
export const updatePiso = (id: string, patch: Partial<Catalogo>) => apiPut<Catalogo>(`/config/pisos/${id}`, patch);
export const deletePiso = (id: string) => apiDelete(`/config/pisos/${id}`);

export const getEstados = () => apiGet<EstadoUnidad[]>("/config/estados");
export const createEstado = (payload: { nombre: string; orden?: number }) =>
  apiPost<EstadoUnidad>("/config/estados", payload);
export const updateEstado = (id: string, patch: Partial<EstadoUnidad>) =>
  apiPut<EstadoUnidad>(`/config/estados/${id}`, patch);
export const deleteEstado = (id: string) => apiDelete(`/config/estados/${id}`);

export const getCuotas = () => apiGet<Cuota[]>("/config/cuotas");
export const createCuota = (payload: CuotaPayload) => apiPost<Cuota>("/config/cuotas", payload);
export const updateCuota = (id: string, patch: Partial<CuotaPayload> & { activo?: boolean }) =>
  apiPut<Cuota>(`/config/cuotas/${id}`, patch);
export const deleteCuota = (id: string) => apiDelete(`/config/cuotas/${id}`);

// Bancos
export const getBancos = () => apiGet<Catalogo[]>("/config/bancos");
export const createBanco = (nombre: string) => apiPost<Catalogo>("/config/bancos", { nombre });
export const updateBanco = (id: string, patch: Partial<Catalogo>) => apiPut<Catalogo>(`/config/bancos/${id}`, patch);
export const deleteBanco = (id: string) => apiDelete(`/config/bancos/${id}`);

// ---- Traslados X01 ----
export interface PagoX01 {
  id: string;
  fecha_pago: string;
  monto_total: string | number;
  metodo: MetodoPago;
  banco_origen: string | null;
  referencia_banco: string | null;
  estado: string;
  created_at: string;
  conceptos: string | null;
  traslados: {
    id: string;
    fecha: string;
    numero_propiedad: string;
    propietario: string | null;
    monto: string | number;
  }[];
}

export interface TrasladoHistorial {
  id: string;
  id_pago: string;
  id_unidad_destino: string;
  numero_propiedad: string;
  propietario: string | null;
  justificacion: string;
  monto_total: string | number;
  realizado_por: string | null;
  created_at: string;
  pago: { monto_total: string | number; metodo: string; referencia_banco: string | null; fecha_pago: string } | null;
}

export interface TrasladosData {
  pendientes: PagoX01[];
  historial: TrasladoHistorial[];
}

export interface UnidadDestino {
  id: string;
  numero_propiedad: string | null;
  propietario: string | null;
}

export interface TrasladoPayload {
  id_pago: string;
  id_unidad_destino: string;
  justificacion: string;
  monto_trasladar?: number;
  fecha_traslado?: string;
  aplicaciones?: { id_cargo: string; monto_aplicado?: number }[];
}

export const getTraslados = () => apiGet<TrasladosData>("/traslados");
export const getUnidadesDestino = () => apiGet<UnidadDestino[]>("/traslados/unidades-destino");
export const trasladarPago = (payload: TrasladoPayload) => apiPost<{ message: string }>("/traslados", payload);

// ── Config Email (SMTP por complejo) ──
export interface ConfigEmail {
  id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass_set: boolean;
  from_name: string | null;
  from_email: string;
  activo: boolean;
}

export const getConfigEmail = () => apiGet<ConfigEmail | null>("/config-email");
export const saveConfigEmail = (data: {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass?: string;
  from_name?: string;
  from_email: string;
  activo?: boolean;
}) => apiPut<ConfigEmail>("/config-email", data);
export const testConfigEmail = (destinatario?: string) =>
  apiPost<{ ok: boolean; message: string }>("/config-email/test", { destinatario });

export interface ConfigWhatsapp {
  id: string;
  phone_number_id: string;
  numero_visible: string | null;
  api_version: string;
  token_set: boolean;
  activo: boolean;
}
export interface GestionCobranza {
  fecha: string;
  canal: string;
  resultado: string;
  promesa_fecha: string | null;
  nota: string | null;
}
export interface CobranzaItem {
  id_unidad: string;
  numero_propiedad: string | null;
  bloque: string | null;
  calle: string | null;
  propietario: string | null;
  telefono: string | null;
  email: string | null;
  saldo: number;
  cuota_mensual: number;
  prioridad: "alta" | "media" | "baja";
  ultima_gestion: GestionCobranza | null;
  promesa: { fecha: string; promesa_fecha: string } | null;
}
export interface CobranzaData {
  total_morosos: number;
  total_deuda: number;
  por_prioridad: { alta: number; media: number; baja: number };
  items: CobranzaItem[];
}
export const getCobranza = () => apiGet<CobranzaData>("/cobranza");
export interface CobranzaResumen {
  total_gestiones: number;
  gestiones_mes: number;
  promesas: { vencidas: number; hoy: number; proximas: number };
}
export const getCobranzaResumen = () => apiGet<CobranzaResumen>("/cobranza/resumen");
export interface BitacoraItem {
  id: string;
  id_unidad: string;
  numero_propiedad: string;
  propietario: string | null;
  fecha: string;
  canal: string;
  resultado: string;
  promesa_fecha: string | null;
  nota: string | null;
  saldo_al_momento: number | null;
  registrado_por: string | null;
  created_at: string;
}
export const getBitacora = (limit = 300) => apiGet<BitacoraItem[]>(`/cobranza/gestiones?limit=${limit}`);
export const registrarGestion = (payload: {
  id_unidad: string;
  canal: string;
  resultado: string;
  promesa_fecha?: string;
  nota?: string;
  saldo_al_momento?: number;
}) => apiPost<{ id: string }>("/cobranza/gestion", payload);
export const enviarCobranzaEmail = (payload: {
  id_unidad: string;
  to: string;
  asunto: string;
  cuerpo: string;
  saldo_al_momento?: number;
  guardar_email?: boolean;
}) => apiPost<{ ok: boolean; message: string; email_guardado: boolean }>("/cobranza/email", payload);
export const getGestiones = (idUnidad: string) =>
  apiGet<(GestionCobranza & { id: string; saldo_al_momento: number | null; registrado_por: string | null; created_at: string })[]>(
    `/cobranza/${encodeURIComponent(idUnidad)}/gestiones`
  );

export const getConfigWhatsapp = () => apiGet<ConfigWhatsapp | null>("/config-whatsapp");
export const saveConfigWhatsapp = (data: {
  phone_number_id: string;
  access_token?: string;
  numero_visible?: string;
  api_version?: string;
  activo?: boolean;
}) => apiPut<ConfigWhatsapp>("/config-whatsapp", data);
export const testConfigWhatsapp = (destinatario: string, nombre?: string) =>
  apiPost<{ ok: boolean; message: string }>("/config-whatsapp/test", { destinatario, nombre });

// ── Portal Propietario ──
export interface MiUnidad {
  id: string;
  numero_propiedad: string | null;
  bloque: string | null;
  calle: string | null;
  estado: string | null;
  lat: number | null;
  lng: number | null;
  poligono: string | null;
}

export interface RespuestaMensaje {
  id: string;
  nombre_usuario: string;
  texto: string;
  fecha: string;
}

export interface MensajePortal {
  id: string;
  categoria: string;
  asunto: string;
  mensaje: string;
  estado: string;
  id_unidad: string | null;
  numero_propiedad: string | null;
  fecha: string;
  respuestas: RespuestaMensaje[];
}

export interface MensajeAdmin extends MensajePortal {
  nombre_usuario: string;
}

export interface TransparenciaData {
  nombre_complejo: string;
  kpis: { saldo_caja: number; recaudado_mes: number; gastado_mes: number };
  meses: { periodo: string; recaudado: number; gastado: number }[];
  categorias_mes: { categoria: string; monto: number; items: { descripcion: string; proveedor: string | null; monto: number }[] }[];
  segmentos_deuda: { id: string; count: number; total: number }[];
}

export interface DetalleMesData {
  periodo: string;
  recaudado: number;
  gastos: { descripcion: string; proveedor: string | null; monto: number; categoria: string; fecha: string }[];
}

export const getTransparencia = () => apiGet<TransparenciaData>("/portal/transparencia");
export const getDetalleMes = (periodo: string) => apiGet<DetalleMesData>(`/portal/transparencia/${periodo}`);
export const getMisUnidades = () => apiGet<MiUnidad[]>("/portal/mis-unidades");
export const getPortalEstadoCuenta = (idUnidad: string) =>
  apiGet<EstadoCuenta>(`/portal/estado-cuenta/${encodeURIComponent(idUnidad)}`);
export const getMisMensajes = () => apiGet<MensajePortal[]>("/portal/mensajes");
export const crearMensaje = (data: { categoria: string; asunto: string; mensaje: string; id_unidad?: string }) =>
  apiPost<{ id: string }>("/portal/mensajes", data);

export const getMensajesAdmin = () => apiGet<MensajeAdmin[]>("/mensajes");
export const responderMensaje = (id: string, respuesta: string) =>
  apiPut<{ ok: boolean }>(`/mensajes/${id}/responder`, { respuesta });

// ── Accesos propietario ──
export interface AccesoUnidad { id: string; numero_propiedad: string | null }
export interface AccesoPropietario {
  id: string;
  nombre: string;
  email_propietario: string | null;
  telefono: string | null;
  unidades: AccesoUnidad[];
  usuario: { id: string; email: string; created_at: string } | null;
}
export const getAccesos = () => apiGet<AccesoPropietario[]>("/accesos");
export const crearAcceso = (data: { id_propietario: string; email: string; password: string }) =>
  apiPost<{ id: string; email: string }>("/accesos", data);
export const eliminarAcceso = (id: string) => apiDelete(`/accesos/${id}`);
