import * as nodemailer from "nodemailer";
import { prisma } from "../db/prisma.js";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from_name: string | null;
  from_email: string;
}

export async function getSmtpConfig(idComplejo: string): Promise<SmtpConfig | null> {
  const cfg = await prisma.config_email.findUnique({ where: { id_complejo: idComplejo } });
  if (!cfg || !cfg.activo) return null;
  return {
    host: cfg.smtp_host,
    port: cfg.smtp_port,
    secure: cfg.smtp_secure,
    user: cfg.smtp_user,
    pass: cfg.smtp_pass,
    from_name: cfg.from_name,
    from_email: cfg.from_email,
  };
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

function buildTransporter(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

function buildFrom(cfg: SmtpConfig): string {
  return cfg.from_name ? `"${cfg.from_name}" <${cfg.from_email}>` : cfg.from_email;
}

export async function sendBulkEmails(
  idComplejo: string,
  emails: EmailPayload[]
): Promise<{ sent: number; failed: number; configured: boolean }> {
  const cfg = await getSmtpConfig(idComplejo);
  if (!cfg) {
    console.warn("[mailer] No SMTP config for complejo", idComplejo, "— skipping", emails.length, "emails");
    return { sent: 0, failed: 0, configured: false };
  }

  const transporter = buildTransporter(cfg);
  const from = buildFrom(cfg);
  let sent = 0;
  let failed = 0;

  for (const e of emails) {
    try {
      await transporter.sendMail({ from, to: e.to, subject: e.subject, html: e.html });
      sent++;
    } catch (err) {
      console.error("[mailer] Failed to send to", e.to, err);
      failed++;
    }
  }

  return { sent, failed, configured: true };
}
