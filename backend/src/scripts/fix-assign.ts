import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL = 'C:/OVA_DTE/Base completa pagos.xlsx';

async function main() {
  const complejos = await prisma.complejos.findFirst();
  const idComplejo = complejos!.id;

  // Get all unidades with their current propietario assignment
  const unidades = await prisma.unidades.findMany({
    where: { id_complejo: idComplejo },
    include: { historial_propietarios: { where: { fecha_fin: null } } },
  });

  const sinPropietario = unidades.filter(u => u.historial_propietarios.length === 0);
  console.log(`Unidades sin propietario: ${sinPropietario.length}/${unidades.length}`);
  for (const u of sinPropietario) {
    console.log(`  ${u.id} (${u.numero_propiedad})`);
  }

  // Load Excel to get the mapping
  const wb = XLSX.readFile(EXCEL);
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  // Build lote → email/nombre map from Excel
  const excelMap = new Map<string, { nombre: string; email: string | null }>();
  for (const row of rows) {
    const lote = row.LOTE?.trim();
    const nombre = row.NOMBRE?.trim() ?? '';
    const email = row.EMAIL != null ? String(row.EMAIL).trim().toLowerCase() : null;
    if (lote) excelMap.set(lote, { nombre, email });
  }

  // Get all propietarios
  const propietarios = await prisma.propietarios.findMany({
    where: { id_complejo: idComplejo },
    select: { id: true, nombre: true, apellido: true, email: true },
  });

  // Build email → propietario id map
  const emailToProp = new Map<string, string>();
  for (const p of propietarios) {
    if (p.email) emailToProp.set(p.email.toLowerCase(), p.id);
  }

  // Build name → propietario id map (fallback)
  const nameToProp = new Map<string, string>();
  for (const p of propietarios) {
    nameToProp.set(`${p.nombre} ${p.apellido}`.toLowerCase().trim(), p.id);
  }

  // Assign propietarios to unidades that don't have one
  let assigned = 0;
  for (const u of sinPropietario) {
    const lote = u.numero_propiedad;
    if (!lote) continue;

    const excel = excelMap.get(lote);
    if (!excel) {
      console.log(`  ${lote}: no encontrado en Excel`);
      continue;
    }

    // Find propietario by email first, then by name
    let propId: string | undefined;
    if (excel.email) {
      propId = emailToProp.get(excel.email);
    }

    if (!propId) {
      // Try matching by name
      const parts = excel.nombre.split(/[/]/)[0].trim().split(/\s+/);
      const apellido = parts.length > 1 ? parts.slice(-2).join(' ') : parts[0];
      const nombreP = parts.length > 2 ? parts.slice(0, -2).join(' ') : parts[0];
      const fullName = `${nombreP} ${parts.length > 1 ? apellido : ''}`.toLowerCase().trim();
      propId = nameToProp.get(fullName);
    }

    if (propId) {
      await prisma.historial_propietarios.create({
        data: {
          id_unidad: u.id,
          id_propietario: propId,
          fecha_inicio: new Date('2022-12-01'),
        },
      });
      console.log(`  ✓ ${lote} → propietario ${propId}`);
      assigned++;
    } else {
      console.log(`  ✗ ${lote}: propietario no encontrado (${excel.nombre} / ${excel.email})`);
    }
  }

  console.log(`\nAsignados: ${assigned}`);
  await prisma.$disconnect();
}
main().catch(console.error);
