import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  await prisma.$queryRawUnsafe(`
    IF COL_LENGTH('mensajes', 'respondido_por') IS NULL
      ALTER TABLE mensajes ADD respondido_por NVARCHAR(100) NULL
  `);
  console.log("Column respondido_por added to mensajes");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
