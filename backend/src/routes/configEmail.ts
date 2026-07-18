import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import * as nodemailer from "nodemailer";

const router = Router();
const soloAdmin = requireRole("admin", "superadmin");

function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({ message: "Complejo no especificado" });
    return null;
  }
  return req.complejoId;
}

// GET /config-email — obtener config SMTP del complejo (oculta password)
router.get("/", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const cfg = await prisma.config_email.findUnique({ where: { id_complejo: idc } });
  if (!cfg) return res.json(null);

  res.json({
    id: cfg.id,
    smtp_host: cfg.smtp_host,
    smtp_port: cfg.smtp_port,
    smtp_secure: cfg.smtp_secure,
    smtp_user: cfg.smtp_user,
    smtp_pass_set: !!cfg.smtp_pass,
    from_name: cfg.from_name,
    from_email: cfg.from_email,
    activo: cfg.activo,
  });
});

// PUT /config-email — crear o actualizar config SMTP
router.put("/", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email, activo } = req.body ?? {};

  if (!smtp_host?.trim() || !smtp_user?.trim() || !from_email?.trim()) {
    return res.status(400).json({ message: "smtp_host, smtp_user y from_email son requeridos" });
  }

  const existing = await prisma.config_email.findUnique({ where: { id_complejo: idc } });

  const data = {
    smtp_host: smtp_host.trim(),
    smtp_port: smtp_port != null ? Number(smtp_port) : 587,
    smtp_secure: !!smtp_secure,
    smtp_user: smtp_user.trim(),
    smtp_pass: smtp_pass?.trim() || existing?.smtp_pass || "",
    from_name: from_name?.trim() || null,
    from_email: from_email.trim(),
    activo: activo !== false,
  };

  if (!data.smtp_pass) {
    return res.status(400).json({ message: "smtp_pass es requerido" });
  }

  const cfg = existing
    ? await prisma.config_email.update({ where: { id_complejo: idc }, data })
    : await prisma.config_email.create({ data: { ...data, id_complejo: idc } });

  res.json({
    id: cfg.id,
    smtp_host: cfg.smtp_host,
    smtp_port: cfg.smtp_port,
    smtp_secure: cfg.smtp_secure,
    smtp_user: cfg.smtp_user,
    smtp_pass_set: true,
    from_name: cfg.from_name,
    from_email: cfg.from_email,
    activo: cfg.activo,
  });
});

// POST /config-email/test — enviar correo de prueba
router.post("/test", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const cfg = await prisma.config_email.findUnique({ where: { id_complejo: idc } });
  if (!cfg || !cfg.activo) {
    return res.status(400).json({ message: "No hay configuración SMTP activa para este complejo" });
  }

  const { destinatario } = req.body ?? {};
  const to = destinatario?.trim() || cfg.smtp_user;

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: cfg.smtp_port,
      secure: cfg.smtp_secure,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    });

    const from = cfg.from_name ? `"${cfg.from_name}" <${cfg.from_email}>` : cfg.from_email;
    await transporter.sendMail({
      from,
      to,
      subject: "Correo de prueba — Residencial",
      html: `<div style="font-family:sans-serif;line-height:1.6"><p>Este es un correo de prueba para verificar la configuración SMTP.</p><p>Si recibiste este mensaje, la configuración es correcta.</p></div>`,
    });

    res.json({ ok: true, message: `Correo de prueba enviado a ${to}` });
  } catch (err: any) {
    res.status(400).json({ ok: false, message: err.message ?? "Error al enviar correo de prueba" });
  }
});

export default router;
