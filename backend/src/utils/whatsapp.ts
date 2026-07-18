import { prisma } from "../db/prisma.js";

// Configuración de WhatsApp Cloud API por complejo (tabla config_whatsapp).
export interface WhatsappConfig {
  phone_number_id: string;
  access_token: string;
  api_version: string;
}

export async function getWhatsappConfig(idComplejo: string): Promise<WhatsappConfig | null> {
  const cfg = await prisma.config_whatsapp.findUnique({ where: { id_complejo: idComplejo } });
  if (!cfg || !cfg.activo) return null;
  return {
    phone_number_id: cfg.phone_number_id,
    access_token: cfg.access_token,
    api_version: cfg.api_version || "v21.0",
  };
}

// Normaliza a solo dígitos en formato internacional (503XXXXXXXX). La Cloud API
// no requiere el "+". Devuelve null si no parece un número válido.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  return digits;
}

const CURRENCY = new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" });
const fmt = (n: number) => CURRENCY.format(n);
const mesNombre = () => {
  const s = new Date().toLocaleDateString("es", { month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Destinatario mínimo que necesita el despacho (subconjunto del de avisos).
export interface DestinatarioWA {
  nombre: string;
  telefono: string | null;
  saldo: number;
  cuota_mensual: number;
  meses_mora: number;
}

// Mapa tipo de aviso -> plantilla aprobada en WhatsApp Manager + parámetros del body.
// El orden de params debe coincidir EXACTAMENTE con {{1}}, {{2}}... de la plantilla.
type PlantillaWA = { template: string; idioma: string; params: (d: DestinatarioWA) => string[] };

export const PLANTILLAS_WA: Record<string, PlantillaWA> = {
  recordatorio_pago: {
    template: "recordatorio_pago",
    idioma: "es",
    // Hola {{1}}, le recordamos que su cuota del mes de {{2}}, año {{3}} por un monto de {{4}} se encuentra pendiente...
    params: (d) => [d.nombre, mesNombre(), String(new Date().getFullYear()), fmt(d.cuota_mensual)],
  },
  aviso_mora: {
    template: "aviso_mora",
    idioma: "es",
    // Estimado/a {{1}}, su cuenta presenta una mora por un total de {{2}}...
    params: (d) => [d.nombre, fmt(d.saldo)],
  },
};

async function enviarPlantilla(
  cfg: WhatsappConfig,
  to: string,
  plantilla: PlantillaWA,
  d: DestinatarioWA
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://graph.facebook.com/${cfg.api_version}/${cfg.phone_number_id}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: plantilla.template,
      language: { code: plantilla.idioma },
      components: [
        {
          type: "body",
          parameters: plantilla.params(d).map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `HTTP ${resp.status}: ${txt.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "error de red" };
  }
}

// Despacha una plantilla a todos los destinatarios con teléfono. Secuencial para
// no gatillar rate limits. Devuelve conteos para actualizar el aviso.
export async function sendBulkWhatsAppTemplate(
  idComplejo: string,
  tipo: string,
  destinatarios: DestinatarioWA[]
): Promise<{ sent: number; failed: number; configured: boolean; soportado: boolean }> {
  const plantilla = PLANTILLAS_WA[tipo];
  if (!plantilla) {
    console.warn(`[whatsapp] tipo "${tipo}" sin plantilla configurada — se omite WhatsApp`);
    return { sent: 0, failed: 0, configured: true, soportado: false };
  }

  const cfg = await getWhatsappConfig(idComplejo);
  if (!cfg) {
    console.warn("[whatsapp] sin config activa para complejo", idComplejo, "— se omiten", destinatarios.length, "mensajes");
    return { sent: 0, failed: 0, configured: false, soportado: true };
  }

  let sent = 0;
  let failed = 0;
  for (const d of destinatarios) {
    const to = normalizePhone(d.telefono);
    if (!to) { failed++; continue; }
    const r = await enviarPlantilla(cfg, to, plantilla, d);
    if (r.ok) sent++;
    else { failed++; console.warn(`[whatsapp] fallo a ${to}:`, r.error); }
  }
  return { sent, failed, configured: true, soportado: true };
}
