import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const all = await prisma.propietarios.findMany({
    where: { telefono: { not: null } },
    select: { id: true, nombre: true, telefono: true },
  });

  console.log("Total con teléfono:", all.length);

  let cleaned = 0;
  let prepended = 0;

  for (const p of all) {
    let tel = p.telefono!;
    const original = tel;

    // Remove spaces, dashes, dots, parentheses
    tel = tel.replace(/[\s\-\.\(\)]/g, '');

    // If 8 digits, prepend 503
    if (/^\d{8}$/.test(tel) && !tel.startsWith('503')) {
      tel = '503' + tel;
      prepended++;
    }

    if (tel !== original) {
      await prisma.propietarios.update({
        where: { id: p.id },
        data: { telefono: tel },
      });
      cleaned++;
      console.log(`  ${p.nombre}: ${original} → ${tel}`);
    }
  }

  console.log(`\nLimpiados: ${cleaned}, Con 503: ${prepended}`);

  // Sample
  const sample = await prisma.propietarios.findMany({
    where: { telefono: { not: null } },
    select: { nombre: true, telefono: true },
    take: 10,
  });
  console.log("\nMuestra:");
  console.table(sample);

  await prisma.$disconnect();
}

main().catch(console.error);
