import { Router } from "express";
import { prisma } from "../db/prisma.js";

const router = Router();

// GET /api/v1/health — verifica que la API y la conexión a la BD respondan.
router.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    res.json({ status: "ok", db: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({
      status: "ok",
      db: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
