import XLSX from 'xlsx';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL = 'C:/OVA_DTE/Base completa pagos.xlsx';

// Month string → Date (first day of month)
function parseMonth(key: string): Date | null {
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const m = key.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (!m) return null;
  const mon = months[m[1]];
  if (mon === undefined) return null;
  const year = 2000 + parseInt(m[2]);
  return new Date(Date.UTC(year, mon, 1));
}

async function main() {
  const complejos = await prisma.complejos.findFirst();
  const idComplejo = complejos!.id;

  // Get unidades map: numero_propiedad → id
  const unidades = await prisma.unidades.findMany({
    where: { id_complejo: idComplejo },
    select: { id: true, numero_propiedad: true },
  });
  const unidadMap = new Map<string, string>();
  for (const u of unidades) {
    if (u.numero_propiedad) unidadMap.set(u.numero_propiedad, u.id);
  }

  // Get estado IDs
  const estados = await prisma.estados_unidad.findMany();
  const estadoConstruida = estados.find(e => e.nombre === 'Construida')?.id;
  const estadoSinConst = estados.find(e => e.nombre === 'Sin construcción')?.id;
  console.log('Estado Construida:', estadoConstruida);
  console.log('Estado Sin construcción:', estadoSinConst);

  // Read Excel
  const wb = XLSX.readFile(EXCEL);
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  const infoKeys = ['LOTE', 'CALLE', 'NOMBRE', 'PAIS DE RESIDENCIA', 'TELEFONO', 'EMAIL', 'ESTATUS', 'OBSERVACION'];

  let cargosCreated = 0;
  let cargosSkipped = 0;
  let estadosCreated = 0;
  let errors = 0;

  for (const row of rows) {
    const lote = row.LOTE?.trim();
    if (!lote) continue;

    const unidadId = unidadMap.get(lote);
    if (!unidadId) {
      console.log(`SKIP ${lote}: unidad no encontrada`);
      continue;
    }

    const dateKeys = Object.keys(row).filter(k => !infoKeys.includes(k));
    let prevAmount: number | null = null;
    let transitionLogged = false;

    for (const dk of dateKeys) {
      const val = row[dk];
      const amount = typeof val === 'number' ? val : parseFloat(val);
      if (isNaN(amount) || amount <= 0) continue;

      const fecha = parseMonth(dk);
      if (!fecha) continue;

      // Insert cargo
      try {
        await prisma.cargos.create({
          data: {
            id_complejo: idComplejo,
            id_unidad: unidadId,
            concepto: 'Cuota de mantenimiento',
            periodo_mes: fecha,
            monto: new Prisma.Decimal(amount),
            saldo: new Prisma.Decimal(amount),
            estado: 'pendiente',
            fecha_vencimiento: new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)),
          },
        });
        cargosCreated++;
      } catch (e: any) {
        if (e.code === 'P2002') {
          cargosSkipped++; // duplicate
        } else {
          console.log(`ERROR cargo ${lote} ${dk}:`, e.message?.slice(0, 80));
          errors++;
        }
      }

      // Detect $50 → $70 transition (Sin construcción → Construida)
      if (prevAmount !== null && prevAmount === 50 && amount === 70 && !transitionLogged) {
        transitionLogged = true;
        console.log(`  ${lote}: $50→$70 en ${dk} → cambio de estado`);

        if (estadoConstruida && estadoSinConst) {
          try {
            // Close "Sin construcción" historial
            const openHist = await prisma.historial_estado_unidad.findFirst({
              where: { id_unidad: unidadId, id_estado: estadoSinConst, fecha_fin: null },
            });
            if (openHist) {
              await prisma.historial_estado_unidad.update({
                where: { id: openHist.id },
                data: { fecha_fin: fecha },
              });
            }

            // Create "Construida" historial
            await prisma.historial_estado_unidad.create({
              data: {
                id_unidad: unidadId,
                id_estado: estadoConstruida,
                fecha_inicio: fecha,
              },
            });

            // Update current estado on unidad
            await prisma.unidades.update({
              where: { id: unidadId },
              data: { id_estado_unidad: estadoConstruida },
            });

            estadosCreated++;
          } catch (e: any) {
            console.log(`ERROR estado ${lote}:`, e.message?.slice(0, 80));
          }
        }
      }

      prevAmount = amount;
    }
  }

  console.log(`\nCargos: ${cargosCreated} creados, ${cargosSkipped} duplicados, ${errors} errores`);
  console.log(`Cambios de estado registrados: ${estadosCreated}`);

  // Also insert initial "Sin construcción" historial for units that started at $50
  // (only if they don't already have a historial entry)
  let initialEstados = 0;
  for (const row of rows) {
    const lote = row.LOTE?.trim();
    if (!lote) continue;
    const unidadId = unidadMap.get(lote);
    if (!unidadId) continue;

    const dateKeys = Object.keys(row).filter(k => !infoKeys.includes(k));
    const firstKey = dateKeys[0];
    const firstVal = typeof row[firstKey] === 'number' ? row[firstKey] : parseFloat(row[firstKey]);
    if (isNaN(firstVal) || firstVal <= 0) continue;

    const firstDate = parseMonth(firstKey);
    if (!firstDate) continue;

    const initialEstado = firstVal === 50 ? estadoSinConst : estadoConstruida;
    if (!initialEstado) continue;

    // Check if there's already a historial entry starting at or before firstDate
    const existing = await prisma.historial_estado_unidad.findFirst({
      where: { id_unidad: unidadId },
    });
    if (!existing) {
      await prisma.historial_estado_unidad.create({
        data: {
          id_unidad: unidadId,
          id_estado: initialEstado,
          fecha_inicio: firstDate,
        },
      });
      initialEstados++;
    }
  }
  console.log(`Historiales de estado iniciales creados: ${initialEstados}`);

  await prisma.$disconnect();
}
main().catch(console.error);
