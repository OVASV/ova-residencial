import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const results = await p.propietarios.findMany({
    where: {
      OR: [
        { nombre: { contains: 'Mike' } },
        { nombre: { contains: 'MIKE' } },
        { nombre: { contains: 'Hector' } },
        { nombre: { contains: 'Melgar' } },
        { apellido: { contains: 'Mike' } },
        { apellido: { contains: 'Melgar' } },
      ],
    },
    select: { id: true, nombre: true, apellido: true, email: true, dpi_nit: true },
  });
  console.log(JSON.stringify(results, null, 2));

  // Also check: propietarios with null email AND null dpi_nit
  const nulls = await p.propietarios.findMany({
    where: { email: null, dpi_nit: null },
    select: { id: true, nombre: true, apellido: true },
  });
  console.log('\nPropietarios sin email ni DPI:', nulls.length);
  nulls.forEach(n => console.log(`  ${n.nombre} ${n.apellido}`));

  await p.$disconnect();
}
main();
