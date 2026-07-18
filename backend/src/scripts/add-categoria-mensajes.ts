import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  await prisma.$queryRawUnsafe(`
    IF COL_LENGTH('mensajes', 'categoria') IS NULL
      ALTER TABLE mensajes ADD categoria NVARCHAR(50) NOT NULL CONSTRAINT DF_mensajes_categoria DEFAULT ('general')
  `);
  console.log("Column categoria added to mensajes");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
