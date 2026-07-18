import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const all = await prisma.unidades.findMany({
    select: { id: true, numero_propiedad: true, created_at: true },
    orderBy: { numero_propiedad: 'asc' },
  });
  console.log('Total unidades:', all.length);

  const seen = new Map<string, typeof all>();
  for (const u of all) {
    const key = u.numero_propiedad ?? '';
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(u);
  }

  for (const [np, items] of seen) {
    if (items.length > 1) {
      console.log(`DUP "${np}":`);
      for (const i of items) console.log(`  ${i.id} created ${i.created_at}`);
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);
