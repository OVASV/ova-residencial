import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

// Carpeta de comprobantes en disco (servida en /uploads).
// En Azure App Service apuntar a almacenamiento persistente vía UPLOAD_DIR
// (p. ej. /home/data/uploads), fuera de la carpeta de despliegue.
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const TIPOS_OK = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (TIPOS_OK.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo no permitido (solo imagen JPG/PNG/WEBP/GIF o PDF)"));
  },
});

export const tipoComprobante = (mimetype: string) => (mimetype === "application/pdf" ? "pdf" : "imagen");

// Mueve un archivo recién subido (plano en /uploads) a una subcarpeta, renombrándolo
// con una etiqueta legible (p. ej. el período "2023-04") para reconocerlo en auditoría.
// Devuelve la nueva URL pública (/uploads/<subcarpeta>/<etiqueta>_<uuid>.<ext>).
export function moverAComprobante(filename: string, subcarpeta: string, etiqueta: string): string {
  const carpeta = subcarpeta.replace(/[^a-zA-Z0-9_-]/g, "");
  const et = (etiqueta || "sin-fecha").replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(UPLOAD_DIR, carpeta);
  fs.mkdirSync(dir, { recursive: true });
  const nuevoNombre = `${et}_${filename}`;
  fs.renameSync(path.join(UPLOAD_DIR, filename), path.join(dir, nuevoNombre));
  return `/uploads/${carpeta}/${nuevoNombre}`;
}

// Borra un archivo del disco a partir de su URL (/uploads/... incluidas subcarpetas). Silencioso.
export function borrarArchivo(url?: string | null) {
  if (!url) return;
  const rel = url.replace(/^\/+uploads\/+/, "");
  fs.unlink(path.join(UPLOAD_DIR, rel), () => {});
}
