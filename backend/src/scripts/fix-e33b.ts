import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const e33 = await p.unidades.findFirst({
    where: { numero_propiedad: 'E33' },
    include: { historial_propietarios: { where: { fecha_fin: null }, include: { propietarios: { select: { id: true, nombre: true, apellido: true } } } } },
  });
  console.log('E33 assigned to:', e33?.historial_propietarios[0]?.propietarios);

  const wrongId = e33?.historial_propietarios[0]?.id;
  if (wrongId) {
    await p.historial_propietarios.delete({ where: { id: wrongId } });
    console.log('Removed wrong assignment');
  }

  const complejos = await p.complejos.findFirst();
  const nuevo = await p.propietarios.create({
    data: { id_complejo: complejos!.id, nombre: 'Edwin Alexis', apellido: 'Rivas Fernandez', email: 'riovasquez@hotmail.com', telefono: '50371601800' },
  });
  console.log('Created:', nuevo.nombre, nuevo.apellido);

  await p.historial_propietarios.create({
    data: { id_unidad: e33!.id, id_propietario: nuevo.id, fecha_inicio: new Date('2022-12-01') },
  });
  console.log('✓ E33 → Edwin Alexis Rivas Fernandez');
  await p.$disconnect();
}
main();
