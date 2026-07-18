import { Router } from "express";
import { prisma } from "../db/prisma.js";

const router = Router();

// GET /api/v1/paises — lista de países activos (para selects del frontend).
router.get("/", async (_req, res) => {
  const paises = await prisma.paises.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });
  res.json(paises);
});

export default router;
