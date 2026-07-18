import { prisma } from "../db/prisma.js";

// ¿El período (YYYY-MM) de este complejo está cerrado contablemente?
export async function estaPeriodoCerrado(idComplejo: string, periodo: string): Promise<boolean> {
  const c = await prisma.cierres_periodo.findFirst({
    where: { id_complejo: idComplejo, periodo, cerrado: true },
    select: { id: true },
  });
  return !!c;
}

// YYYY-MM de una fecha (UTC).
export function periodoDeFecha(d: Date): string {
  return d.toISOString().slice(0, 10).slice(0, 7);
}

export const PERIODO_CERRADO_MSG =
  "El período está cerrado contablemente. Pídele al superadministrador que lo reabra si necesitas modificarlo.";
