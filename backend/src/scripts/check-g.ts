import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const bloques = await p.bloques.findMany({ select: { id: true, nombre: true } });
  console.log('Bloques:');
  for (const b of bloques) console.log(`  "${b.nombre}" → ${b.id}`);

  const gs = await p.unidades.findMany({
    where: { numero_propiedad: { startsWith: 'G' } },
    select: { id: true, numero_propiedad: true, bloque: true, id_bloque: true },
    take: 3,
  });
  console.log('\nG units sample:', JSON.stringify(gs, null, 2));

  // Check if bloque name has trailing space or different case
  const gBloque = bloques.find(b => b.nombre.trim().toUpperCase() === 'G');
  console.log('\nG bloque match:', gBloque);

  await p.$disconnect();
}
main();
