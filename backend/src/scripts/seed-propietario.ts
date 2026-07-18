import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";

const COMPLEJO_MIRADOR = "ef245d19-ff9d-4a1f-ba12-03ff1d6afc27";

async function main() {
  // Find the first propietario in El Mirador
  const prop = await prisma.propietarios.findFirst({
    where: { id_complejo: COMPLEJO_MIRADOR, activo: true },
    select: { id: true, nombre: true },
  });

  if (!prop) {
    console.log("No propietarios found in El Mirador. Skipping.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Linking to propietario: ${prop.nombre} (${prop.id})`);

  const hash = await bcrypt.hash("prop123", 10);

  await prisma.$queryRawUnsafe(`
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'propietario@lospinos.gt')
      INSERT INTO usuarios (id, nombre, email, password_hash, rol, id_complejo, id_propietario, activo)
      VALUES (newid(), '${prop.nombre}', 'propietario@lospinos.gt', '${hash}', 'propietario', '${COMPLEJO_MIRADOR}', '${prop.id}', 1)
    ELSE
      UPDATE usuarios SET id_propietario = '${prop.id}', id_complejo = '${COMPLEJO_MIRADOR}'
      WHERE email = 'propietario@lospinos.gt'
  `);

  console.log("Propietario user created: propietario@lospinos.gt / prop123");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
