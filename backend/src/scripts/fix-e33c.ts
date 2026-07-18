import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const e33 = await p.unidades.findFirst({ where: { numero_propiedad: 'E33' } });
  const complejos = await p.complejos.findFirst();

  const nuevo = await p.propietarios.create({
    data: { id_complejo: complejos!.id, nombre: 'Edwin Alexis', apellido: 'Rivas Fernandez' },
  });
  console.log('Created:', nuevo.nombre, nuevo.apellido);

  await p.historial_propietarios.create({
    data: { id_unidad: e33!.id, id_propietario: nuevo.id, fecha_inicio: new Date('2022-12-01') },
  });
  console.log('✓ E33 → Edwin Alexis Rivas Fernandez');
  await p.$disconnect();
}
main();
