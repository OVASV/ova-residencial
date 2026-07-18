import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL = 'C:/OVA_DTE/Base completa pagos.xlsx';

async function main() {
  const complejos = await prisma.complejos.findFirst();
  const idComplejo = complejos!.id;

  const wb = XLSX.readFile(EXCEL);
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  // E33 should be Edwin Alexis Rivas Fernandez
  const e33Row = rows.find((r: any) => r.LOTE?.trim() === 'E33');
  console.log('E33 Excel:', e33Row?.NOMBRE, e33Row?.EMAIL, e33Row?.TELEFONO);

  const e33 = await prisma.unidades.findFirst({ where: { numero_propiedad: 'E33' } });
  if (!e33) { console.log('E33 not found'); return; }

  // Remove wrong assignment (Felix Alonso)
  const wrong = await prisma.historial_propietarios.findFirst({ where: { id_unidad: e33.id, fecha_fin: null } });
  if (wrong) {
    await prisma.historial_propietarios.delete({ where: { id: wrong.id } });
    console.log('E33: removida asignación de Felix Alonso');
  }

  // Check if Edwin Alexis exists
  let edwin = await prisma.propietarios.findFirst({
    where: { id_complejo: idComplejo, nombre: { contains: 'Edwin' }, apellido: { contains: 'Rivas' } },
  });
  if (!edwin) {
    const tel = e33Row?.TELEFONO != null ? String(e33Row.TELEFONO).replace(/[\s\-\.\(\)]/g, '') : null;
    const email = e33Row?.EMAIL != null ? String(e33Row.EMAIL).trim() : null;
    edwin = await prisma.propietarios.create({
      data: {
        id_complejo: idComplejo,
        nombre: 'Edwin Alexis',
        apellido: 'Rivas Fernandez',
        telefono: tel && tel.length === 8 ? '503' + tel : tel,
        email,
      },
    });
    console.log('Creado: Edwin Alexis Rivas Fernandez');
  } else {
    console.log('Ya existe:', edwin.nombre, edwin.apellido);
  }

  await prisma.historial_propietarios.create({
    data: { id_unidad: e33.id, id_propietario: edwin.id, fecha_inicio: new Date('2022-12-01') },
  });
  console.log('✓ E33 → Edwin Alexis Rivas Fernandez');

  // Also check: Felix should only have his real unit
  const felix = await prisma.propietarios.findFirst({ where: { nombre: { contains: 'Felix' }, apellido: { contains: 'Alfaro' } } });
  if (felix) {
    const fHist = await prisma.historial_propietarios.findMany({
      where: { id_propietario: felix.id, fecha_fin: null },
      include: { unidades: { select: { numero_propiedad: true } } },
    });
    console.log(`Felix Alonso ahora tiene: ${fHist.map(h => h.unidades.numero_propiedad).join(', ')}`);
  }

  await prisma.$disconnect();
}
main();
