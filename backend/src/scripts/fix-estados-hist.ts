import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL = 'C:/OVA_DTE/Base completa pagos.xlsx';

function parseMonth(key: string): Date | null {
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const m = key.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (!m) return null;
  const mon = months[m[1]];
  if (mon === undefined) return null;
  return new Date(2000 + parseInt(m[2]), mon, 1);
}

async function main() {
  const complejos = await prisma.complejos.findFirst();
  const idComplejo = complejos!.id;

  const unidades = await prisma.unidades.findMany({
    where: { id_complejo: idComplejo },
    select: { id: true, numero_propiedad: true },
  });
  const unidadMap = new Map<string, string>();
  for (const u of unidades) {
    if (u.numero_propiedad) unidadMap.set(u.numero_propiedad, u.id);
  }

  const estadoCasa = '7d40dc6e-5215-4222-a389-a92acb8a552e';
  const estadoSinConst = '3efe791c-846e-4943-bdc1-f6cb0a498e22';

  const wb = XLSX.readFile(EXCEL);
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];
  const infoKeys = ['LOTE', 'CALLE', 'NOMBRE', 'PAIS DE RESIDENCIA', 'TELEFONO', 'EMAIL', 'ESTATUS', 'OBSERVACION'];

  let initialCreated = 0;
  let transitionsCreated = 0;

  for (const row of rows) {
    const lote = row.LOTE?.trim();
    if (!lote) continue;
    const unidadId = unidadMap.get(lote);
    if (!unidadId) continue;

    const dateKeys = Object.keys(row).filter(k => !infoKeys.includes(k));
    let prevAmount: number | null = null;
    let transitionDone = false;

    // Find first valid amount and its date
    let firstAmount: number | null = null;
    let firstDate: Date | null = null;

    for (const dk of dateKeys) {
      const val = row[dk];
      const amount = typeof val === 'number' ? val : parseFloat(val);
      if (isNaN(amount) || amount <= 0) continue;
      const fecha = parseMonth(dk);
      if (!fecha) continue;

      if (firstAmount === null) {
        firstAmount = amount;
        firstDate = fecha;
      }

      // Detect transition
      if (prevAmount !== null && prevAmount === 50 && amount === 70 && !transitionDone) {
        transitionDone = true;

        // Close ALL open historiales for this unit
        const openHists = await prisma.historial_estado_unidad.findMany({
          where: { id_unidad: unidadId, fecha_fin: null },
        });
        for (const oh of openHists) {
          await prisma.historial_estado_unidad.update({
            where: { id: oh.id },
            data: { fecha_fin: fecha },
          });
        }

        // Create "Casa"
        await prisma.historial_estado_unidad.create({
          data: { id_unidad: unidadId, id_estado: estadoCasa, fecha_inicio: fecha },
        });

        // Update current estado
        await prisma.unidades.update({
          where: { id: unidadId },
          data: { id_estado_unidad: estadoCasa },
        });

        console.log(`  ✓ ${lote}: Sin construcción → Casa en ${dk}`);
        transitionsCreated++;
      }

      prevAmount = amount;
    }

    // Create initial historial if none exists
    if (firstAmount !== null && firstDate) {
      const existing = await prisma.historial_estado_unidad.findFirst({
        where: { id_unidad: unidadId },
      });
      if (!existing) {
        const initialEstado = firstAmount === 50 ? estadoSinConst : estadoCasa;
        await prisma.historial_estado_unidad.create({
          data: { id_unidad: unidadId, id_estado: initialEstado, fecha_inicio: firstDate },
        });
        initialCreated++;
      }
    }
  }

  console.log(`\nHistoriales iniciales: ${initialCreated}`);
  console.log(`Transiciones Sin construcción → Casa: ${transitionsCreated}`);

  await prisma.$disconnect();
}
main().catch(console.error);
