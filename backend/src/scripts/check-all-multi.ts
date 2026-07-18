import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL = 'C:/OVA_DTE/Base completa pagos.xlsx';

async function main() {
  const wb = XLSX.readFile(EXCEL);
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  const excelMap = new Map<string, string>();
  for (const row of rows) {
    const lote = row.LOTE?.trim();
    if (lote) excelMap.set(lote, row.NOMBRE?.trim() ?? '');
  }

  // Get all current assignments
  const hist = await prisma.historial_propietarios.findMany({
    where: { fecha_fin: null },
    include: {
      propietarios: { select: { nombre: true, apellido: true } },
      unidades: { select: { id: true, numero_propiedad: true } },
    },
  });

  // Check mismatches
  let mismatches = 0;
  for (const h of hist) {
    const lote = h.unidades.numero_propiedad;
    if (!lote) continue;
    const excelName = excelMap.get(lote);
    if (!excelName) continue;

    const dbName = `${h.propietarios.nombre} ${h.propietarios.apellido}`.toLowerCase();
    const exName = excelName.split('/')[0].trim().toLowerCase();

    // Simple check: does the DB name contain at least the first word of Excel name?
    const firstWord = exName.split(/\s+/)[0];
    if (!dbName.includes(firstWord)) {
      console.log(`MISMATCH ${lote}: Excel="${excelName}" → DB="${h.propietarios.nombre} ${h.propietarios.apellido}"`);
      mismatches++;
    }
  }
  console.log(`\nTotal mismatches: ${mismatches}`);

  await prisma.$disconnect();
}
main();
