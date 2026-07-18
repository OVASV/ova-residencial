import { Router } from "express";
import type { Request, Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { upload, UPLOAD_DIR } from "../upload.js";

const router = Router();
const soloAdmin = requireRole("admin", "superadmin");

function complejoId(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({ message: "Complejo no especificado (superadmin: enviar header X-Complejo-ID)" });
    return null;
  }
  return req.complejoId;
}

/* ===================== INFO Y DIRECCIÓN DEL PROYECTO ===================== */

// GET /complejo — datos generales + ubicación del complejo actual.
router.get("/", async (req, res) => {
  const id = complejoId(req, res);
  if (!id) return;
  const c = await prisma.complejos.findUnique({
    where: { id },
    include: {
      LVD_PAIS: { select: { Id: true, Nombre: true } },
      LVD_DEPARTAMENTO: { select: { Id: true, Nombre: true } },
      LVD_MUNICIPIO: { select: { Id: true, Nombre: true } },
    },
  });
  if (!c) return res.status(404).json({ message: "Complejo no encontrado" });
  res.json({
    id: c.id,
    nombre: c.nombre,
    ciudad: c.ciudad,
    direccion: c.direccion,
    logo_url: c.logo_url,
    id_pais_geo: c.id_pais_geo,
    id_departamento: c.id_departamento,
    id_municipio: c.id_municipio,
    pais: c.LVD_PAIS,
    departamento: c.LVD_DEPARTAMENTO,
    municipio: c.LVD_MUNICIPIO,
  });
});

// PUT /complejo — actualizar datos generales + ubicación.
router.put("/", soloAdmin, async (req, res) => {
  const id = complejoId(req, res);
  if (!id) return;
  const { nombre, ciudad, direccion, id_pais_geo, id_departamento, id_municipio } = req.body ?? {};
  const updated = await prisma.complejos.update({
    where: { id },
    data: {
      ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
      ...(ciudad !== undefined ? { ciudad: ciudad || null } : {}),
      ...(direccion !== undefined ? { direccion: direccion || null } : {}),
      ...(id_pais_geo !== undefined ? { id_pais_geo: id_pais_geo ?? null } : {}),
      ...(id_departamento !== undefined ? { id_departamento: id_departamento ?? null } : {}),
      ...(id_municipio !== undefined ? { id_municipio: id_municipio ?? null } : {}),
    },
  });
  res.json(updated);
});

/* ===================== LOGO ===================== */

const LOGOS_DIR = path.join(UPLOAD_DIR, "logos");
fs.mkdirSync(LOGOS_DIR, { recursive: true });

// POST /complejo/logo — sube logo del complejo activo.
router.post("/logo", soloAdmin, upload.single("logo"), async (req, res) => {
  const id = complejoId(req, res);
  if (!id) return;
  const complejo = await prisma.complejos.findUnique({ where: { id } });
  if (!complejo) return res.status(404).json({ message: "Complejo no encontrado" });
  if (!req.file) return res.status(400).json({ message: "Archivo requerido" });

  const dest = path.join(LOGOS_DIR, req.file.filename);
  fs.renameSync(req.file.path, dest);

  if (complejo.logo_url) {
    const oldPath = path.join(UPLOAD_DIR, complejo.logo_url.replace(/^\/uploads\//, ""));
    fs.unlink(oldPath, () => {});
  }

  const logoUrl = `/uploads/logos/${req.file.filename}`;
  await prisma.complejos.update({ where: { id }, data: { logo_url: logoUrl } });
  res.json({ logo_url: logoUrl });
});

// DELETE /complejo/logo — elimina logo del complejo activo.
router.delete("/logo", soloAdmin, async (req, res) => {
  const id = complejoId(req, res);
  if (!id) return;
  const complejo = await prisma.complejos.findUnique({ where: { id } });
  if (!complejo) return res.status(404).json({ message: "Complejo no encontrado" });
  if (complejo.logo_url) {
    const filePath = path.join(UPLOAD_DIR, complejo.logo_url.replace(/^\/uploads\//, ""));
    fs.unlink(filePath, () => {});
    await prisma.complejos.update({ where: { id }, data: { logo_url: null } });
  }
  res.json({ ok: true });
});

/* ===================== CATÁLOGOS GEOGRÁFICOS (cascada) ===================== */

// GET /complejo/geo/paises — solo países que tienen departamentos (Guatemala, etc.).
router.get("/geo/paises", async (_req, res) => {
  const data = await prisma.lVD_PAIS.findMany({
    where: { LVD_DEPARTAMENTO: { some: {} } },
    select: { Id: true, Codigo: true, Nombre: true },
    orderBy: { Nombre: "asc" },
  });
  res.json(data);
});

// GET /complejo/geo/departamentos?id_pais=
router.get("/geo/departamentos", async (req, res) => {
  const idPais = Number(req.query.id_pais);
  if (!idPais) return res.status(400).json({ message: "id_pais es requerido" });
  const data = await prisma.lVD_DEPARTAMENTO.findMany({
    where: { IdPais: idPais },
    select: { Id: true, Nombre: true },
    orderBy: { Nombre: "asc" },
  });
  res.json(data);
});

// GET /complejo/geo/municipios?id_departamento=
router.get("/geo/municipios", async (req, res) => {
  const idDepto = Number(req.query.id_departamento);
  if (!idDepto) return res.status(400).json({ message: "id_departamento es requerido" });
  const data = await prisma.lVD_MUNICIPIO.findMany({
    where: { IdDepartamento: idDepto },
    select: { Id: true, Nombre: true },
    orderBy: { Nombre: "asc" },
  });
  res.json(data);
});

export default router;
