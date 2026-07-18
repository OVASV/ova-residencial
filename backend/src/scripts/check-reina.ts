import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  // Find Reina Isabel
  const reina = await p.propietarios.findMany({
    where: { OR: [{ nombre: { contains: 'Reina' } }, { apellido: { contains: 'Ventura' } }] },
    select: { id: true, nombre: true, apellido: true, email: true, telefono: true },
  });
  console.log('Reina:', JSON.stringify(reina, null, 2));

  if (reina.length > 0) {
    const hist = await p.historial_propietarios.findMany({
      where: { id_propietario: reina[0].id, fecha_fin: null },
      include: { unidades: { select: { id: true, numero_propiedad: true } } },
    });
    console.log('Unidades asignadas:', hist.map(h => `${h.unidades.id} (${h.unidades.numero_propiedad})`));
  }

  // Check which propietarios have more than 2 units
  const all = await p.historial_propietarios.findMany({
    where: { fecha_fin: null },
    select: { id_propietario: true, id_unidad: true },
  });
  const counts = new Map<string, string[]>();
  for (const h of all) {
    if (!counts.has(h.id_propietario)) counts.set(h.id_propietario, []);
    counts.get(h.id_propietario)!.push(h.id_unidad);
  }

  for (const [propId, units] of counts) {
    if (units.length > 2) {
      const prop = await p.propietarios.findUnique({ where: { id: propId }, select: { nombre: true, apellido: true, email: true } });
      console.log(`\n${prop?.nombre} ${prop?.apellido} (${prop?.email}): ${units.length} unidades → ${units.join(', ')}`);
    }
  }

  await p.$disconnect();
}
main();
