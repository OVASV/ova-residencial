import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const complejos = await prisma.complejos.findFirst();
  const idComplejo = complejos!.id;

  // H14 should be Manuel de Jesus Gomez Abarca, not Agua Mar
  const h14 = await prisma.unidades.findFirst({ where: { numero_propiedad: 'H14' } });
  if (h14) {
    const wrong = await prisma.historial_propietarios.findFirst({ where: { id_unidad: h14.id, fecha_fin: null } });
    if (wrong) {
      await prisma.historial_propietarios.delete({ where: { id: wrong.id } });
      console.log('H14: removida asignación de Agua Mar');
    }

    // Check if Manuel exists
    let manuel = await prisma.propietarios.findFirst({
      where: { id_complejo: idComplejo, nombre: { contains: 'Manuel' }, apellido: { contains: 'Gomez' } },
    });
    if (!manuel) {
      manuel = await prisma.propietarios.create({
        data: { id_complejo: idComplejo, nombre: 'Manuel de Jesus', apellido: 'Gomez Abarca' },
      });
      console.log('Creado: Manuel de Jesus Gomez Abarca');
    }

    await prisma.historial_propietarios.create({
      data: { id_unidad: h14.id, id_propietario: manuel.id, fecha_inicio: new Date('2022-12-01') },
    });
    console.log('✓ H14 → Manuel de Jesus Gomez Abarca');
  }

  // Verify Agua Mar
  const aguaMar = await prisma.propietarios.findFirst({ where: { nombre: { contains: 'Agua' } } });
  if (aguaMar) {
    const hist = await prisma.historial_propietarios.findMany({
      where: { id_propietario: aguaMar.id, fecha_fin: null },
      include: { unidades: { select: { numero_propiedad: true } } },
    });
    console.log(`Agua Mar ahora tiene: ${hist.map(h => h.unidades.numero_propiedad).join(', ')}`);
  }

  await prisma.$disconnect();
}
main();
