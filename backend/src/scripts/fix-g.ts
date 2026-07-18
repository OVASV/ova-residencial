import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  // Fix all units where bloque text doesn't match the first letter of numero_propiedad
  const all = await p.unidades.findMany({ select: { id: true, numero_propiedad: true, bloque: true } });
  let fixed = 0;
  for (const u of all) {
    const letra = u.numero_propiedad?.charAt(0)?.toUpperCase();
    if (letra && u.bloque !== letra) {
      await p.unidades.update({ where: { id: u.id }, data: { bloque: letra } });
      console.log(`  ${u.numero_propiedad}: "${u.bloque}" → "${letra}"`);
      fixed++;
    }
  }
  console.log(`Fixed: ${fixed}`);
  await p.$disconnect();
}
main();
