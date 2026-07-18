import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const u = await prisma.unidades.findFirst({
    where: { numero_propiedad: 'F13' },
    include: { historial_propietarios: { where: { fecha_fin: null }, include: { propietarios: true } } },
  });
  console.log(JSON.stringify(u, null, 2));
  await prisma.$disconnect();
}
main();
