import "dotenv/config";
import { prisma } from "../db/prisma.js";
async function main() {
  const c = await prisma.complejos.findUnique({ where: { id: "ef245d19-ff9d-4a1f-ba12-03ff1d6afc27" }, select: { logo_url: true } });
  console.log("logo_url:", c?.logo_url);
  await prisma.$disconnect();
}
main();
