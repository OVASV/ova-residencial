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

  // Find all lotes that share email with existing propietarios but belong to different people
  // Build lote → real owner name from Excel
  const excelMap = new Map<string, { nombre: string; email: string | null; telefono: string | null }>();
  for (const row of rows) {
    const lote = row.LOTE?.trim();
    if (lote) excelMap.set(lote, {
      nombre: row.NOMBRE?.trim() ?? '',
      email: row.EMAIL != null ? String(row.EMAIL).trim() : null,
      telefono: row.TELEFONO != null ? String(row.TELEFONO).trim() : null,
    });
  }

  // Fix Ventura Gamez family - remove wrong assignments and create correct propietarios
  const fixes = [
    // E04 stays with Reina Isabel (correct)
    { lote: 'E05', nombre: 'Marisol', apellido: 'Ventura Gamez' },
    { lote: 'E28', nombre: 'Josè Mauricio', apellido: 'Ventura Gamez' },
    { lote: 'F06', nombre: 'Josè Mauricio', apellido: 'Ventura Gamez' },
    { lote: 'F08', nombre: 'Carlos Alexander', apellido: 'Ventura Gamez' },
    { lote: 'F27', nombre: 'Josè Mauricio', apellido: 'Ventura Gamez' },
    { lote: 'F32', nombre: 'Josè Orlando', apellido: 'Ventura Gamez' },
  ];

  // Also fix Agua Mar if needed
  const aguaMarUnits = ['H14', 'H15', 'H16'];
  for (const lote of aguaMarUnits) {
    const excel = excelMap.get(lote);
    console.log(`${lote}: Excel="${excel?.nombre}" (${excel?.email})`);
  }

  // Create propietarios that don't exist and reassign
  const created = new Map<string, string>(); // fullname → propietario id

  for (const fix of fixes) {
    const fullName = `${fix.nombre} ${fix.apellido}`;

    // Check if propietario already created in this run
    let propId = created.get(fullName);

    if (!propId) {
      // Check if exists in DB
      const existing = await prisma.propietarios.findFirst({
        where: { id_complejo: idComplejo, nombre: fix.nombre, apellido: fix.apellido },
      });

      if (existing) {
        propId = existing.id;
        console.log(`  Existe: ${fullName} (${propId})`);
      } else {
        const nuevo = await prisma.propietarios.create({
          data: {
            id_complejo: idComplejo,
            nombre: fix.nombre,
            apellido: fix.apellido,
          },
        });
        propId = nuevo.id;
        console.log(`  Creado: ${fullName} (${propId})`);
      }
      created.set(fullName, propId);
    }

    // Find the unidad
    const unidad = await prisma.unidades.findFirst({ where: { numero_propiedad: fix.lote } });
    if (!unidad) { console.log(`  ✗ ${fix.lote} no encontrada`); continue; }

    // Remove wrong assignment
    const wrongAssign = await prisma.historial_propietarios.findFirst({
      where: { id_unidad: unidad.id, fecha_fin: null },
    });
    if (wrongAssign) {
      await prisma.historial_propietarios.delete({ where: { id: wrongAssign.id } });
      console.log(`  ✓ ${fix.lote}: removida asignación anterior`);
    }

    // Create correct assignment
    await prisma.historial_propietarios.create({
      data: {
        id_unidad: unidad.id,
        id_propietario: propId,
        fecha_inicio: new Date('2022-12-01'),
      },
    });
    console.log(`  ✓ ${fix.lote} → ${fullName}`);
  }

  // Verify Reina Isabel now
  const reina = await prisma.propietarios.findFirst({
    where: { nombre: { contains: 'Reina' }, apellido: { contains: 'Ventura' } },
  });
  if (reina) {
    const hist = await prisma.historial_propietarios.findMany({
      where: { id_propietario: reina.id, fecha_fin: null },
      include: { unidades: { select: { numero_propiedad: true } } },
    });
    console.log(`\nReina Isabel ahora tiene: ${hist.map(h => h.unidades.numero_propiedad).join(', ')}`);
  }

  await prisma.$disconnect();
}
main();
