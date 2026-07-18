import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  const constraints: any[] = await prisma.$queryRawUnsafe(
    "SELECT name, definition FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('dbo.usuarios')"
  );
  console.log("Current constraints:", constraints);

  for (const c of constraints) {
    if (String(c.name).includes("rol")) {
      console.log(`Dropping ${c.name}...`);
      await prisma.$queryRawUnsafe(`ALTER TABLE dbo.usuarios DROP CONSTRAINT [${c.name}]`);
    }
  }
  await prisma.$queryRawUnsafe(
    "ALTER TABLE dbo.usuarios ADD CONSTRAINT CK_usuarios_rol CHECK (rol IN ('superadmin','admin','lectura','directiva'))"
  );
  console.log("Constraint updated!");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
