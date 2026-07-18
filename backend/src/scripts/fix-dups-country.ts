import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Delete duplicate unidades U-0001 to U-0010
  const dupsToDelete = Array.from({ length: 10 }, (_, i) => `U-${String(i + 1).padStart(4, '0')}`);
  console.log('Eliminando duplicados:', dupsToDelete);

  for (const id of dupsToDelete) {
    try {
      await prisma.historial_estado_unidad.deleteMany({ where: { id_unidad: id } });
      await prisma.historial_propietarios.deleteMany({ where: { id_unidad: id } });
      await prisma.cargos.deleteMany({ where: { id_unidad: id } });
      await prisma.pagos.deleteMany({ where: { id_unidad: id } });
      await prisma.unidades.delete({ where: { id } });
      console.log(`  ✓ ${id} eliminado`);
    } catch (e: any) {
      console.log(`  ✗ ${id}: ${e.message?.slice(0, 120)}`);
    }
  }

  const count = await prisma.unidades.count();
  console.log(`\nTotal unidades ahora: ${count}`);

  // 2. Get paises catalog (id is Int)
  const paises = await prisma.paises.findMany();
  const paisMap: Record<string, number> = {};
  for (const p of paises) {
    const n = p.nombre.toLowerCase();
    if (n.includes('salvador')) paisMap['sv'] = p.id;
    if (n.includes('alemania') || n.includes('germany')) paisMap['de'] = p.id;
    if (n.includes('estados') || n.includes('united')) paisMap['us'] = p.id;
  }
  console.log('\nPaíses:', paisMap);

  // Create Alemania if missing
  if (!paisMap['de']) {
    const maxId = Math.max(...paises.map(p => p.id)) + 1;
    const p = await prisma.paises.create({ data: { id: maxId, codigo_iso2: 'DE', codigo_iso3: 'DEU', nombre: 'Alemania', nombre_en: 'Germany' } });
    paisMap['de'] = p.id;
    console.log('Creado: Alemania, id:', p.id);
  }

  // 3. Update id_pais on propietarios based on phone prefix
  const props = await prisma.propietarios.findMany({
    where: { telefono: { not: null } },
    select: { id: true, nombre: true, telefono: true, id_pais: true },
  });

  let updated = 0;
  for (const p of props) {
    const tel = (p.telefono ?? '').replace('+', '');
    let newPais: number;

    if (tel.startsWith('503')) {
      newPais = paisMap['sv'];
    } else if (tel.startsWith('49')) {
      newPais = paisMap['de'];
    } else {
      newPais = paisMap['us'];
    }

    if (newPais && newPais !== p.id_pais) {
      await prisma.propietarios.update({
        where: { id: p.id },
        data: { id_pais: newPais },
      });
      const label = tel.startsWith('503') ? 'SV' : tel.startsWith('49') ? 'DE' : 'US';
      console.log(`  ${p.nombre}: ${p.telefono} → ${label}`);
      updated++;
    }
  }

  console.log(`\nPaíses actualizados: ${updated}`);
  await prisma.$disconnect();
}
main().catch(console.error);
