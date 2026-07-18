import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { getWhatsappConfig, normalizePhone } from "../utils/whatsapp.js";

const router = Router();
const soloAdmin = requireRole("admin", "superadmin");

function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({ message: "Complejo no especificado" });
    return null;
  }
  return req.complejoId;
}

// GET /config-whatsapp — config actual (oculta el token)
router.get("/", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const cfg = await prisma.config_whatsapp.findUnique({ where: { id_complejo: idc } });
  if (!cfg) return res.json(null);

  res.json({
    id: cfg.id,
    phone_number_id: cfg.phone_number_id,
    numero_visible: cfg.numero_visible,
    api_version: cfg.api_version,
    token_set: !!cfg.access_token,
    activo: cfg.activo,
  });
});

// PUT /config-whatsapp — crear o actualizar
router.put("/", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const { phone_number_id, access_token, numero_visible, api_version, activo } = req.body ?? {};

  if (!phone_number_id?.trim()) {
    return res.status(400).json({ message: "phone_number_id es requerido" });
  }

  const existing = await prisma.config_whatsapp.findUnique({ where: { id_complejo: idc } });

  const token = access_token?.trim() || existing?.access_token || "";
  if (!token) {
    return res.status(400).json({ message: "access_token es requerido" });
  }

  const data = {
    phone_number_id: phone_number_id.trim(),
    access_token: token,
    numero_visible: numero_visible?.trim() || null,
    api_version: api_version?.trim() || "v21.0",
    activo: activo !== false,
  };

  const cfg = existing
    ? await prisma.config_whatsapp.update({ where: { id_complejo: idc }, data })
    : await prisma.config_whatsapp.create({ data: { ...data, id_complejo: idc } });

  res.json({
    id: cfg.id,
    phone_number_id: cfg.phone_number_id,
    numero_visible: cfg.numero_visible,
    api_version: cfg.api_version,
    token_set: true,
    activo: cfg.activo,
  });
});

// POST /config-whatsapp/test — envía la plantilla recordatorio_pago a un número de prueba.
router.post("/test", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const cfg = await getWhatsappConfig(idc);
  if (!cfg) {
    return res.status(400).json({ message: "No hay configuración de WhatsApp activa para este complejo" });
  }

  const to = normalizePhone(req.body?.destinatario);
  if (!to) return res.status(400).json({ message: "Número de destino inválido" });

  const nombre = (req.body?.nombre as string)?.trim() || "propietario";
  const mes = (() => { const s = new Date().toLocaleDateString("es", { month: "long" }); return s.charAt(0).toUpperCase() + s.slice(1); })();

  const url = `https://graph.facebook.com/${cfg.api_version}/${cfg.phone_number_id}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "recordatorio_pago",
      language: { code: "es" },
      components: [{ type: "body", parameters: [nombre, mes, String(new Date().getFullYear()), "$0.00"].map((text) => ({ type: "text", text })) }],
    },
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(400).json({ ok: false, message: (json as any)?.error?.message ?? `HTTP ${resp.status}` });
    res.json({ ok: true, message: `Mensaje de prueba enviado a ${to}` });
  } catch (err: any) {
    res.status(400).json({ ok: false, message: err?.message ?? "Error al enviar la prueba" });
  }
});

export default router;
