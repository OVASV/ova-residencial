import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  const complejos = await prisma.complejos.findMany({ select: { id: true, nombre: true } });
  console.log("Complejos:", complejos);

  // Use El Mirador complejo
  const mirador = complejos.find((c) => c.nombre.includes("Mirador"));
  if (!mirador) {
    console.log("No se encontró El Mirador, usando el primero:", complejos[0]);
  }
  const targetId = mirador?.id ?? complejos[0]?.id;
  if (!targetId) { console.log("No hay complejos"); return; }

  await prisma.usuarios.update({
    where: { email: "directiva@lospinos.gt" },
    data: { id_complejo: targetId },
  });
  console.log(`directiva@lospinos.gt asignado a complejo ${targetId}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
