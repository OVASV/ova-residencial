import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const complejos = await prisma.complejos.findFirst();
  const idComplejo = complejos!.id;

  const unidades = await prisma.unidades.findMany({
    where: { id_complejo: idComplejo },
    select: { id: true, numero_propiedad: true, id_bloque: true, bloque: true },
  });

  // Get unique first letters
  const letras = new Set<string>();
  for (const u of unidades) {
    const letra = u.numero_propiedad?.charAt(0)?.toUpperCase();
    if (letra) letras.add(letra);
  }
  console.log('Letras encontradas:', [...letras].sort());

  // Get existing bloques
  const bloques = await prisma.bloques.findMany({ where: { id_complejo: idComplejo } });
  const bloqueMap = new Map<string, string>();
  for (const b of bloques) bloqueMap.set(b.nombre.toUpperCase(), b.id);
  console.log('Bloques existentes:', bloques.map(b => b.nombre));

  // Create missing bloques
  for (const letra of [...letras].sort()) {
    if (!bloqueMap.has(letra)) {
      const nuevo = await prisma.bloques.create({
        data: { id_complejo: idComplejo, nombre: letra },
      });
      bloqueMap.set(letra, nuevo.id);
      console.log(`Creado bloque: ${letra}`);
    }
  }

  // Update unidades
  let updated = 0;
  for (const u of unidades) {
    const letra = u.numero_propiedad?.charAt(0)?.toUpperCase();
    if (!letra) continue;
    const idBloque = bloqueMap.get(letra);
    if (!idBloque) continue;
    if (u.id_bloque === idBloque) continue;

    await prisma.unidades.update({
      where: { id: u.id },
      data: { id_bloque: idBloque, bloque: letra },
    });
    updated++;
  }

  console.log(`\nActualizadas: ${updated} unidades`);
  await prisma.$disconnect();
}
main();
