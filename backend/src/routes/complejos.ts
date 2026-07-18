import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { upload, UPLOAD_DIR } from "../upload.js";

// Gestión de MÚLTIPLES complejos (multiempresa). Solo superadmin.
// El resto de la app opera sobre el complejo activo vía header X-Complejo-ID.
const router = Router();
const soloSuper = requireRole("superadmin");

// GET /complejos — lista todos los complejos con conteos.
router.get("/", soloSuper, async (_req, res) => {
  const data = await prisma.complejos.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      ciudad: true,
      direccion: true,
      logo_url: true,
      activo: true,
      _count: { select: { unidades: true, propietarios: true, usuarios: true } },
    },
  });
  res.json(data);
});

// POST /complejos — crea un nuevo complejo.
router.post("/", soloSuper, async (req, res) => {
  const { nombre, ciudad, direccion } = req.body ?? {};
  if (!nombre?.trim()) return res.status(400).json({ message: "nombre es requerido" });
  const creado = await prisma.complejos.create({
    data: {
      nombre: nombre.trim(),
      ciudad: ciudad?.trim() || null,
      direccion: direccion?.trim() || null,
    },
  });
  res.status(201).json(creado);
});

// PUT /complejos/:id — activar/desactivar o renombrar (gestión global).
router.put("/:id", soloSuper, async (req, res) => {
  const existing = await prisma.complejos.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: "Complejo no encontrado" });
  const { nombre, ciudad, activo } = req.body ?? {};
  const updated = await prisma.complejos.update({
    where: { id: req.params.id },
    data: {
      ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
      ...(ciudad !== undefined ? { ciudad: ciudad || null } : {}),
      ...(activo !== undefined ? { activo } : {}),
    },
  });
  res.json(updated);
});

// POST /complejos/:id/logo — sube logo del complejo.
const LOGOS_DIR = path.join(UPLOAD_DIR, "logos");
fs.mkdirSync(LOGOS_DIR, { recursive: true });

router.post("/:id/logo", soloSuper, upload.single("logo"), async (req, res) => {
  const complejo = await prisma.complejos.findUnique({ where: { id: req.params.id } });
  if (!complejo) return res.status(404).json({ message: "Complejo no encontrado" });
  if (!req.file) return res.status(400).json({ message: "Archivo requerido" });

  // Move file to logos subdirectory
  const dest = path.join(LOGOS_DIR, req.file.filename);
  fs.renameSync(req.file.path, dest);

  // Delete old logo if exists
  if (complejo.logo_url) {
    const oldPath = path.join(UPLOAD_DIR, complejo.logo_url.replace(/^\/uploads\//, ""));
    fs.unlink(oldPath, () => {});
  }

  const logoUrl = `/uploads/logos/${req.file.filename}`;
  await prisma.complejos.update({ where: { id: req.params.id }, data: { logo_url: logoUrl } });
  res.json({ logo_url: logoUrl });
});

// DELETE /complejos/:id/logo — elimina logo del complejo.
router.delete("/:id/logo", soloSuper, async (req, res) => {
  const complejo = await prisma.complejos.findUnique({ where: { id: req.params.id } });
  if (!complejo) return res.status(404).json({ message: "Complejo no encontrado" });
  if (complejo.logo_url) {
    const filePath = path.join(UPLOAD_DIR, complejo.logo_url.replace(/^\/uploads\//, ""));
    fs.unlink(filePath, () => {});
    await prisma.complejos.update({ where: { id: req.params.id }, data: { logo_url: null } });
  }
  res.json({ ok: true });
});

export default router;
