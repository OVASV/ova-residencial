import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  const miradorId = "ef245d19-ff9d-4a1f-ba12-03ff1d6afc27";
  await prisma.usuarios.update({
    where: { email: "admin@lospinos.gt" },
    data: { id_complejo: miradorId },
  });
  console.log("admin@lospinos.gt reasignado a El Mirador");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
