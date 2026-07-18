// Prepara el despliegue de un solo App Service:
//  1) compila el frontend (Vite) y
//  2) copia su build a backend/public, que el backend sirve como estático.
// Uso:  npm run prep:deploy   (desde la carpeta backend/)
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.resolve(backendDir, "..", "frontend");
const frontendDist = path.join(frontendDir, "dist");
const publicDir = path.join(backendDir, "public");

if (!fs.existsSync(frontendDir)) {
  console.error("No se encontró la carpeta frontend en", frontendDir);
  process.exit(1);
}

console.log("→ Compilando el frontend…");
execSync("npm run build", { cwd: frontendDir, stdio: "inherit" });

console.log("→ Copiando build a backend/public…");
fs.rmSync(publicDir, { recursive: true, force: true });
fs.cpSync(frontendDist, publicDir, { recursive: true });

console.log("✓ Listo. El backend servirá el frontend desde ./public");
