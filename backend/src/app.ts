import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import paisesRouter from "./routes/paises.js";
import propietariosRouter from "./routes/propietarios.js";
import unidadesRouter from "./routes/unidades.js";
import configRouter from "./routes/config.js";
import cargosRouter from "./routes/cargos.js";
import pagosRouter from "./routes/pagos.js";
import dashboardRouter from "./routes/dashboard.js";
import complejoRouter from "./routes/complejo.js";
import complejosRouter from "./routes/complejos.js";
import gastosRouter from "./routes/gastos.js";
import avisosRouter from "./routes/avisos.js";
import conciliacionesRouter from "./routes/conciliaciones.js";
import trasladosRouter from "./routes/traslados.js";
import configEmailRouter from "./routes/configEmail.js";
import configWhatsappRouter from "./routes/configWhatsapp.js";
import cobranzaRouter from "./routes/cobranza.js";
import portalRouter from "./routes/portal.js";
import mensajesAdminRouter from "./routes/mensajesAdmin.js";
import accesosRouter from "./routes/accesos.js";
import cierresRouter from "./routes/cierres.js";
import usuariosRouter from "./routes/usuarios.js";
import { UPLOAD_DIR } from "./upload.js";
import { requireAuth } from "./middleware/auth.js";
import { resolveComplejo } from "./middleware/tenant.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Comprobantes subidos (imágenes/PDF), servidos estáticamente.
  app.use("/uploads", express.static(UPLOAD_DIR));

  // Rutas públicas
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/auth", authRouter); // /login y /refresh públicos; /me protegido internamente

  // Rutas protegidas (requieren JWT válido)
  app.use("/api/v1/paises", requireAuth, paisesRouter);

  // Rutas con contexto multi-complejo (JWT + resolución de complejo)
  app.use("/api/v1/propietarios", requireAuth, resolveComplejo, propietariosRouter);
  app.use("/api/v1/unidades", requireAuth, resolveComplejo, unidadesRouter);
  app.use("/api/v1/config", requireAuth, resolveComplejo, configRouter);
  app.use("/api/v1/cargos", requireAuth, resolveComplejo, cargosRouter);
  app.use("/api/v1/pagos", requireAuth, resolveComplejo, pagosRouter);
  app.use("/api/v1/dashboard", requireAuth, resolveComplejo, dashboardRouter);
  app.use("/api/v1/complejos", requireAuth, complejosRouter); // multiempresa (superadmin, global)
  app.use("/api/v1/complejo", requireAuth, resolveComplejo, complejoRouter);
  app.use("/api/v1/gastos", requireAuth, resolveComplejo, gastosRouter);
  app.use("/api/v1/avisos", requireAuth, resolveComplejo, avisosRouter);
  app.use("/api/v1/conciliaciones", requireAuth, resolveComplejo, conciliacionesRouter);
  app.use("/api/v1/traslados", requireAuth, resolveComplejo, trasladosRouter);
  app.use("/api/v1/config-email", requireAuth, resolveComplejo, configEmailRouter);
  app.use("/api/v1/config-whatsapp", requireAuth, resolveComplejo, configWhatsappRouter);
  app.use("/api/v1/cobranza", requireAuth, resolveComplejo, cobranzaRouter);
  app.use("/api/v1/portal", requireAuth, resolveComplejo, portalRouter);
  app.use("/api/v1/mensajes", requireAuth, resolveComplejo, mensajesAdminRouter);
  app.use("/api/v1/accesos", requireAuth, resolveComplejo, accesosRouter);
  app.use("/api/v1/cierres", requireAuth, resolveComplejo, cierresRouter);
  app.use("/api/v1/usuarios", requireAuth, resolveComplejo, usuariosRouter);

  // 404 para rutas de API no encontradas (JSON).
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  // Frontend estático (producción): el backend sirve el build de React.
  // FRONTEND_DIR por defecto ./public (junto al dist del backend). Si no existe
  // (p. ej. en desarrollo, donde el frontend lo sirve Vite), se omite.
  const FRONTEND_DIR = process.env.FRONTEND_DIR
    ? path.resolve(process.env.FRONTEND_DIR)
    : path.resolve(process.cwd(), "public");
  if (fs.existsSync(path.join(FRONTEND_DIR, "index.html"))) {
    app.use(express.static(FRONTEND_DIR));
    // SPA fallback: cualquier ruta no-API devuelve index.html (React Router).
    app.get("*", (_req, res) => {
      res.sendFile(path.join(FRONTEND_DIR, "index.html"));
    });
  } else {
    app.use((_req, res) => {
      res.status(404).json({ error: "Not Found" });
    });
  }

  // Manejo de errores (p. ej. multer: tipo/tamaño de archivo) en JSON.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ message: err.message || "Error en la solicitud" });
  });

  return app;
}
