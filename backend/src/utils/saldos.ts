import { prisma } from "../db/prisma.js";

// ============================================================================
// Fuente única de verdad para saldos y mora.
// Regla: saldo = Σ cargos − Σ pagos (por unidad). Positivo = deuda, negativo =
// crédito a favor. La mora (lo que debe) = saldo sin bajar de 0.
// La lógica PURA (sin BD) está separada para poder testearla.
// ============================================================================

export const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CargoMin { id_unidad: string; monto: number }
export interface PagoMin { id_unidad: string; monto: number }

// ---------------------------- Lógica pura -----------------------------------

/** Saldo de una unidad. Positivo = deuda, negativo = crédito. */
export function calcularSaldo(totalCargos: number, totalPagos: number): number {
  return r2(totalCargos - totalPagos);
}

/** Mora = lo que debe = saldo sin bajar de 0 (un crédito no es mora). */
export function calcularMora(saldo: number): number {
  return saldo > 0 ? r2(saldo) : 0;
}

/** Saldos por unidad a partir de listas crudas de cargos y pagos. */
export function saldosPorUnidadDesde(cargos: CargoMin[], pagos: PagoMin[]): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const c of cargos) saldos.set(c.id_unidad, r2((saldos.get(c.id_unidad) ?? 0) + c.monto));
  for (const p of pagos) saldos.set(p.id_unidad, r2((saldos.get(p.id_unidad) ?? 0) - p.monto));
  return saldos;
}

/** Clave de período "YYYY-MM" en UTC. Evita el bug de String(Date) => "Tue Jun". */
export function periodoKey(fecha: Date): string {
  return fecha.toISOString().slice(0, 7);
}

/** Formato de moneda sin símbolo: 2800 => "2,800.00", 10458.24 => "10,458.24". */
export function fmtMonto(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parsea un monto con coma de miles: "$1,040.00" => 1040. Evita el bug de migración. */
export function parseMonto(txt: string | number | null | undefined): number {
  if (txt == null || txt === "") return 0;
  if (typeof txt === "number") return txt;
  const n = Number(String(txt).replace(/[$\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------- Acceso a BD -----------------------------------

/** Mapa unidad → saldo real (Σ cargos − Σ pagos), para un complejo. */
export async function getSaldosPorUnidad(idComplejo: string): Promise<Map<string, number>> {
  const [cargos, pagos] = await Promise.all([
    prisma.cargos.findMany({
      where: { id_complejo: idComplejo, estado: { not: "anulado" } },
      select: { id_unidad: true, monto: true },
    }),
    prisma.pagos.findMany({
      where: { id_complejo: idComplejo, estado: { not: "anulado" } },
      select: { id_unidad: true, monto_total: true },
    }),
  ]);
  return saldosPorUnidadDesde(
    cargos.map((c) => ({ id_unidad: c.id_unidad, monto: c.monto.toNumber() })),
    pagos.map((p) => ({ id_unidad: p.id_unidad, monto: p.monto_total.toNumber() }))
  );
}

/** Saldo de una unidad específica. */
export async function getSaldoUnidad(idComplejo: string, idUnidad: string): Promise<number> {
  const [totalCargos, totalPagos] = await Promise.all([
    prisma.cargos.aggregate({
      where: { id_complejo: idComplejo, id_unidad: idUnidad, estado: { not: "anulado" } },
      _sum: { monto: true },
    }),
    prisma.pagos.aggregate({
      where: { id_complejo: idComplejo, id_unidad: idUnidad, estado: { not: "anulado" } },
      _sum: { monto_total: true },
    }),
  ]);
  return calcularSaldo(totalCargos._sum.monto?.toNumber() ?? 0, totalPagos._sum.monto_total?.toNumber() ?? 0);
}

/** Mapa unidad → crédito a favor (saldos negativos, en positivo). */
export async function getCreditosPorUnidad(idComplejo: string): Promise<Map<string, number>> {
  const saldos = await getSaldosPorUnidad(idComplejo);
  const creditos = new Map<string, number>();
  for (const [uid, saldo] of saldos) {
    if (saldo < -0.001) creditos.set(uid, r2(Math.abs(saldo)));
  }
  return creditos;
}
