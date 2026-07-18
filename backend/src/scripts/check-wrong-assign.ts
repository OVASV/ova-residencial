import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL = 'C:/OVA_DTE/Base completa pagos.xlsx';

async function main() {
  const wb = XLSX.readFile(EXCEL);
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  // Excel: lote → nombre real
  const excelMap = new Map<string, { nombre: string; email: string | null }>();
  for (const row of rows) {
    const lote = row.LOTE?.trim();
    if (lote) excelMap.set(lote, {
      nombre: row.NOMBRE?.trim() ?? '',
      email: row.EMAIL != null ? String(row.EMAIL).trim() : null,
    });
  }

  // Units with wrong assignment
  const wrongUnits = ['E04', 'E05', 'E28', 'F06', 'F08', 'F27', 'F32'];

  for (const lote of wrongUnits) {
    const excel = excelMap.get(lote);
    const unidad = await prisma.unidades.findFirst({
      where: { numero_propiedad: lote },
      include: {
        historial_propietarios: {
          where: { fecha_fin: null },
          include: { propietarios: { select: { id: true, nombre: true, apellido: true } } },
        },
      },
    });
    const asignado = unidad?.historial_propietarios[0]?.propietarios;
    console.log(`${lote}: Excel="${excel?.nombre}" (${excel?.email}) → Asignado="${asignado?.nombre} ${asignado?.apellido}"`);
  }

  // Also check Gady's extra units
  const gadyUnits = ['E08', 'E26', 'E27'];
  for (const lote of gadyUnits) {
    const excel = excelMap.get(lote);
    console.log(`${lote}: Excel="${excel?.nombre}" (${excel?.email})`);
  }

  await prisma.$disconnect();
}
main();
