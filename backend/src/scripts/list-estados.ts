import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const e = await p.estados_unidad.findMany();
  console.log(JSON.stringify(e, null, 2));
  await p.$disconnect();
}
main();
