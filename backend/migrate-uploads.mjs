// Reorganiza los escaneos YA existentes a subcarpetas por tipo, con el mes-año
// en el nombre, igual que hacen ahora los nuevos:
//   gastos  -> uploads/gastos/<YYYY-MM>_<uuid>.<ext>
//   cierres -> uploads/cierres/<YYYY-MM>_<uuid>.<ext>
//
// Es IDEMPOTENTE: si un archivo ya está en su subcarpeta, lo omite. Si el
// archivo físico no existe, solo lo reporta y no toca la base.
//
// Cómo ejecutarlo EN AZURE (los archivos viven en el disco de Azure):
//   App Service ova-residencial -> Herramientas de desarrollo -> SSH
//   cd /home/site/wwwroot
//   node migrate-uploads.mjs
// (DATABASE_URL y UPLOAD_DIR ya están disponibles como variables del entorno.)

import path from "node:path";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");

// Mueve un archivo plano (/uploads/<uuid>.ext) a /uploads/<sub>/<etiqueta>_<uuid>.ext.
// Devuelve la nueva URL, o null si no se pudo (ya migrado / archivo ausente).
function mover(url, sub, etiqueta) {
  const rel = String(url).replace(/^\/+uploads\/+/, "");
  if (rel.includes("/")) return null; // ya está en una subcarpeta -> omitir
  const src = path.join(UPLOAD_DIR, rel);
  if (!fs.existsSync(src)) return { missing: true };
  const et = (etiqueta || "sin-fecha").replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(UPLOAD_DIR, sub);
  fs.mkdirSync(dir, { recursive: true });
  const nuevoNombre = `${et}_${rel}`;
  fs.renameSync(src, path.join(dir, nuevoNombre));
  return { url: `/uploads/${sub}/${nuevoNombre}` };
}

async function migrarGastos() {
  const gastos = await prisma.gastos.findMany({
    where: { comprobante_url: { not: null } },
    select: { id: true, comprobante_url: true, periodo_mes: true },
  });
  let movidos = 0, omitidos = 0, faltantes = 0;
  for (const g of gastos) {
    const etiqueta = g.periodo_mes.toISOString().slice(0, 7);
    const r = mover(g.comprobante_url, "gastos", etiqueta);
    if (!r) { omitidos++; continue; }
    if (r.missing) { faltantes++; console.warn("  ⚠ archivo no encontrado:", g.comprobante_url); continue; }
    await prisma.gastos.update({ where: { id: g.id }, data: { comprobante_url: r.url } });
    movidos++;
    console.log("  ✓", r.url);
  }
  console.log(`Gastos: ${movidos} movidos, ${omitidos} ya organizados, ${faltantes} sin archivo.`);
}

async function migrarCierres() {
  const cierres = await prisma.cierres_periodo.findMany({
    where: { comprobante_url: { not: null } },
    select: { id: true, comprobante_url: true, periodo: true },
  });
  let movidos = 0, omitidos = 0, faltantes = 0;
  for (const c of cierres) {
    const r = mover(c.comprobante_url, "cierres", c.periodo);
    if (!r) { omitidos++; continue; }
    if (r.missing) { faltantes++; console.warn("  ⚠ archivo no encontrado:", c.comprobante_url); continue; }
    await prisma.cierres_periodo.update({ where: { id: c.id }, data: { comprobante_url: r.url } });
    movidos++;
    console.log("  ✓", r.url);
  }
  console.log(`Cierres: ${movidos} movidos, ${omitidos} ya organizados, ${faltantes} sin archivo.`);
}

(async () => {
  console.log("UPLOAD_DIR =", UPLOAD_DIR);
  console.log("Reorganizando comprobantes de gastos…");
  await migrarGastos();
  console.log("Reorganizando comprobantes de cierres…");
  await migrarCierres();
  console.log("Listo.");
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("Error:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
