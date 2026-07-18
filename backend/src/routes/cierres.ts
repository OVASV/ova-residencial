import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { sendBulkEmails } from "../utils/mailer.js";
import { upload, borrarArchivo } from "../upload.js";

const router = Router();
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function periodoToDate(periodo: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo ?? "");
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(Number(m[1]), mes - 1, 1));
}
function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) { res.status(400).json({ message: "Complejo no especificado" }); return null; }
  return req.complejoId;
}

// Calcula el libro de caja del mes (saldo inicial, movimientos, totales, saldo final).
async function calcularLibro(idc: string, periodoMes: Date) {
  const sigMes = new Date(Date.UTC(periodoMes.getUTCFullYear(), periodoMes.getUTCMonth() + 1, 1));
  const [pagPrev, gasPrev, pagosMes, gastosMes] = await Promise.all([
    prisma.pagos.aggregate({ where: { id_complejo: idc, estado: { not: "anulado" }, fecha_pago: { lt: periodoMes } }, _sum: { monto_total: true } }),
    prisma.gastos.aggregate({ where: { id_complejo: idc, fecha: { lt: periodoMes } }, _sum: { monto: true } }),
    prisma.pagos.findMany({ where: { id_complejo: idc, estado: { not: "anulado" }, fecha_pago: { gte: periodoMes, lt: sigMes } }, select: { fecha_pago: true, monto_total: true, unidades: { select: { numero_propiedad: true } } } }),
    prisma.gastos.findMany({ where: { id_complejo: idc, fecha: { gte: periodoMes, lt: sigMes } }, select: { fecha: true, monto: true, categoria: true, descripcion: true } }),
  ]);
  const saldoInicial = r2((pagPrev._sum.monto_total?.toNumber() ?? 0) - (gasPrev._sum.monto?.toNumber() ?? 0));
  type Mov = { fecha: string; descripcion: string; ingreso: number; egreso: number; orden: number };
  const movs: Mov[] = [];
  for (const p of pagosMes) movs.push({ fecha: p.fecha_pago.toISOString().slice(0, 10), descripcion: `Pago${p.unidades?.numero_propiedad ? " — " + p.unidades.numero_propiedad : ""}`, ingreso: r2(p.monto_total.toNumber()), egreso: 0, orden: 0 });
  for (const g of gastosMes) { const m = g.monto.toNumber(); movs.push({ fecha: g.fecha.toISOString().slice(0, 10), descripcion: `${g.descripcion} (${g.categoria})`, ingreso: m < 0 ? r2(-m) : 0, egreso: m < 0 ? 0 : r2(m), orden: m < 0 ? 0 : 1 }); }
  movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
  let saldo = saldoInicial;
  const movimientos = movs.map((m) => { saldo = r2(saldo + m.ingreso - m.egreso); return { ...m, saldo }; });
  const totalIngresos = r2(movs.reduce((s, m) => s + m.ingreso, 0));
  const totalEgresos = r2(movs.reduce((s, m) => s + m.egreso, 0));
  return { saldoInicial, totalIngresos, totalEgresos, saldoFinal: saldo, movimientos };
}

// GET /cierres — estado de cierres del complejo.
router.get("/", async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const data = await prisma.cierres_periodo.findMany({
    where: { id_complejo: idc },
    orderBy: { periodo: "desc" },
    include: { usuario_cerrado: { select: { nombre: true } }, usuario_reabierto: { select: { nombre: true } } },
  });
  res.json(data.map((c) => ({
    periodo: c.periodo,
    cerrado: c.cerrado,
    saldo_final: c.saldo_final?.toNumber() ?? null,
    cerrado_por: c.usuario_cerrado?.nombre ?? null,
    cerrado_at: c.cerrado_at,
    reabierto_por: c.usuario_reabierto?.nombre ?? null,
    reabierto_at: c.reabierto_at,
    reabierto_solicitado_por: c.reabierto_solicitado_por,
    reabierto_motivo: c.reabierto_motivo,
    comprobante_url: c.comprobante_url,
    comprobante_nombre: c.comprobante_nombre,
  })));
});

// POST /cierres (multipart: campo "archivo" = PDF comprobante bancario + campo "periodo")
// Cierra el período (admin/superadmin), exige el comprobante y notifica a directiva.
router.post("/", requireRole("admin", "superadmin"), upload.single("archivo"), async (req, res) => {
  // Limpia el archivo subido ante cualquier validación fallida (evita huérfanos).
  const limpiar = () => { if (req.file) borrarArchivo(`/uploads/${req.file.filename}`); };

  const idc = complejoEscritura(req, res);
  if (!idc) return limpiar();
  const periodo = req.body?.periodo as string;
  const periodoMes = periodoToDate(periodo);
  if (!periodoMes) { limpiar(); return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" }); }

  // El comprobante bancario (PDF) es obligatorio para poder cerrar el mes.
  if (!req.file) return res.status(400).json({ message: "Debes adjuntar el comprobante bancario (PDF) para cerrar el mes" });
  if (req.file.mimetype !== "application/pdf") { limpiar(); return res.status(400).json({ message: "El comprobante debe ser un archivo PDF" }); }

  const existente = await prisma.cierres_periodo.findFirst({ where: { id_complejo: idc, periodo } });
  if (existente?.cerrado) { limpiar(); return res.status(400).json({ message: "El período ya está cerrado" }); }

  // Regla de secuencia: no se puede cerrar un mes si el anterior sigue abierto.
  // Se exceptúa el primer mes con movimientos (no hay historia previa que cerrar).
  const prevMes = new Date(Date.UTC(periodoMes.getUTCFullYear(), periodoMes.getUTCMonth() - 1, 1));
  const prevPeriodo = prevMes.toISOString().slice(0, 7);
  const prevCerrado = await prisma.cierres_periodo.findFirst({ where: { id_complejo: idc, periodo: prevPeriodo, cerrado: true }, select: { id: true } });
  if (!prevCerrado) {
    const [pagAntes, gasAntes, cargoAntes] = await Promise.all([
      prisma.pagos.count({ where: { id_complejo: idc, estado: { not: "anulado" }, fecha_pago: { lt: periodoMes } } }),
      prisma.gastos.count({ where: { id_complejo: idc, fecha: { lt: periodoMes } } }),
      prisma.cargos.count({ where: { id_complejo: idc, estado: { not: "anulado" }, periodo_mes: { lt: periodoMes } } }),
    ]);
    if (pagAntes + gasAntes + cargoAntes > 0) {
      limpiar();
      const [y, mo] = prevPeriodo.split("-").map(Number);
      return res.status(400).json({ message: `Primero debes cerrar ${MESES[mo - 1]} ${y}. No se puede cerrar un mes mientras el anterior siga abierto.` });
    }
  }

  // Si se re-cierra un mes que tuvo un comprobante anterior, se reemplaza.
  if (existente?.comprobante_url) borrarArchivo(existente.comprobante_url);

  const libro = await calcularLibro(idc, periodoMes);

  const data = {
    cerrado: true,
    saldo_inicial: libro.saldoInicial,
    total_ingresos: libro.totalIngresos,
    total_egresos: libro.totalEgresos,
    saldo_final: libro.saldoFinal,
    comprobante_url: `/uploads/${req.file.filename}`,
    comprobante_nombre: req.file.originalname,
    cerrado_por: req.user?.sub ?? null,
    cerrado_at: new Date(),
    reabierto_por: null,
    reabierto_at: null,
    reabierto_solicitado_por: null,
    reabierto_motivo: null,
  };
  if (existente) await prisma.cierres_periodo.update({ where: { id: existente.id }, data });
  else await prisma.cierres_periodo.create({ data: { ...data, id_complejo: idc, periodo } });

  // Notificar a la directiva por correo con el detalle del libro de caja.
  let emailResult = { sent: 0, configured: false as boolean };
  try {
    const [complejo, directivos] = await Promise.all([
      prisma.complejos.findUnique({ where: { id: idc }, select: { nombre: true } }),
      prisma.usuarios.findMany({ where: { id_complejo: idc, rol: "directiva", activo: true, email: { not: "" } }, select: { email: true } }),
    ]);
    const destinatarios = directivos.map((d) => d.email).filter(Boolean);
    if (destinatarios.length > 0) {
      const [y, mo] = periodo.split("-").map(Number);
      const mesTxt = `${MESES[mo - 1]} ${y}`;
      const filas = libro.movimientos.map((m) => `<tr>
        <td style="padding:3px 6px;border-bottom:1px solid #eee;font-family:monospace">${m.fecha}</td>
        <td style="padding:3px 6px;border-bottom:1px solid #eee">${m.descripcion}</td>
        <td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:right;color:#1D9E75">${m.ingreso > 0 ? "$" + fmt(m.ingreso) : ""}</td>
        <td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:right;color:#E24B4A">${m.egreso > 0 ? "$" + fmt(m.egreso) : ""}</td>
        <td style="padding:3px 6px;border-bottom:1px solid #eee;text-align:right;font-family:monospace">$${fmt(m.saldo)}</td>
      </tr>`).join("");
      const html = `<div style="font-family:sans-serif;color:#222;line-height:1.5">
        <h2 style="color:#0C1B30;margin:0 0 4px">Cierre contable — ${mesTxt}</h2>
        <p style="color:#085041;font-weight:600;margin:0 0 12px">${complejo?.nombre ?? "Residencial"}</p>
        <p>Se ha realizado el <b>cierre del mes de ${mesTxt}</b>. A partir de ahora no se pueden registrar ni modificar gastos, cargos ni pagos de este período.</p>
        <table style="border-collapse:collapse;margin:8px 0 12px;font-size:13px">
          <tr><td style="padding:2px 10px 2px 0">Saldo inicial</td><td style="font-family:monospace;text-align:right">$${fmt(libro.saldoInicial)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#1D9E75">Ingresos del mes</td><td style="font-family:monospace;text-align:right;color:#1D9E75">$${fmt(libro.totalIngresos)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#E24B4A">Egresos del mes</td><td style="font-family:monospace;text-align:right;color:#E24B4A">$${fmt(libro.totalEgresos)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;font-weight:700">Saldo final</td><td style="font-family:monospace;text-align:right;font-weight:700">$${fmt(libro.saldoFinal)}</td></tr>
        </table>
        <h3 style="color:#0C1B30;margin:12px 0 4px">Detalle del libro de caja</h3>
        <table style="border-collapse:collapse;width:100%;font-size:12px">
          <thead><tr style="text-align:left;color:#888;border-bottom:2px solid #085041">
            <th style="padding:4px 6px">Fecha</th><th style="padding:4px 6px">Descripción</th>
            <th style="padding:4px 6px;text-align:right">Ingreso</th><th style="padding:4px 6px;text-align:right">Egreso</th><th style="padding:4px 6px;text-align:right">Saldo</th>
          </tr></thead>
          <tbody>
            <tr><td style="padding:3px 6px;color:#888">—</td><td style="padding:3px 6px;font-weight:600">Saldo inicial</td><td></td><td></td><td style="padding:3px 6px;text-align:right;font-family:monospace;font-weight:600">$${fmt(libro.saldoInicial)}</td></tr>
            ${filas}
          </tbody>
        </table>
      </div>`;
      const r = await sendBulkEmails(idc, destinatarios.map((to) => ({ to, subject: `Cierre contable ${mesTxt} — ${complejo?.nombre ?? "Residencial"}`, html })));
      emailResult = { sent: r.sent, configured: r.configured };
    }
  } catch (e) {
    console.error("[cierre] error enviando email a directiva:", e);
  }

  res.status(201).json({ periodo, cerrado: true, ...libro, email: emailResult });
});

// PUT /cierres/:periodo/comprobante (multipart: campo "archivo" = PDF)
// Sube o reemplaza el estado de cuenta bancario. Permitido AUNQUE el mes esté
// cerrado: solo toca el documento de respaldo, nunca la data contable.
router.put("/:periodo/comprobante", requireRole("admin", "superadmin"), upload.single("archivo"), async (req, res) => {
  const limpiar = () => { if (req.file) borrarArchivo(`/uploads/${req.file.filename}`); };
  const idc = complejoEscritura(req, res);
  if (!idc) return limpiar();
  const periodo = req.params.periodo;
  if (!req.file) return res.status(400).json({ message: "Debes adjuntar el comprobante bancario (PDF)" });
  if (req.file.mimetype !== "application/pdf") { limpiar(); return res.status(400).json({ message: "El comprobante debe ser un archivo PDF" }); }

  const c = await prisma.cierres_periodo.findFirst({ where: { id_complejo: idc, periodo } });
  if (!c) { limpiar(); return res.status(404).json({ message: "No existe un cierre para este período" }); }

  if (c.comprobante_url) borrarArchivo(c.comprobante_url); // reemplaza el anterior
  await prisma.cierres_periodo.update({
    where: { id: c.id },
    data: { comprobante_url: `/uploads/${req.file.filename}`, comprobante_nombre: req.file.originalname },
  });
  res.json({ periodo, comprobante_url: `/uploads/${req.file.filename}`, comprobante_nombre: req.file.originalname });
});

// POST /cierres/:periodo/reabrir — reabre el período (SOLO superadmin).
router.post("/:periodo/reabrir", requireRole("superadmin"), async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  const periodo = req.params.periodo;
  const solicitado_por = String(req.body?.solicitado_por ?? "").trim();
  const motivo = String(req.body?.motivo ?? "").trim();
  if (!solicitado_por) return res.status(400).json({ message: "Indica a solicitud de quién se reabre el período" });
  if (!motivo) return res.status(400).json({ message: "Indica el motivo de la reapertura" });

  const c = await prisma.cierres_periodo.findFirst({ where: { id_complejo: idc, periodo } });
  if (!c || !c.cerrado) return res.status(400).json({ message: "El período no está cerrado" });
  const reabiertoAt = new Date();
  await prisma.cierres_periodo.update({
    where: { id: c.id },
    data: {
      cerrado: false,
      reabierto_por: req.user?.sub ?? null,
      reabierto_at: reabiertoAt,
      reabierto_solicitado_por: solicitado_por.slice(0, 150),
      reabierto_motivo: motivo.slice(0, 500),
    },
  });

  // Notificar a la directiva sobre la reapertura (quién la solicitó y por qué).
  let emailResult = { sent: 0, configured: false as boolean };
  try {
    const [complejo, directivos, reabiertoPor] = await Promise.all([
      prisma.complejos.findUnique({ where: { id: idc }, select: { nombre: true } }),
      prisma.usuarios.findMany({ where: { id_complejo: idc, rol: "directiva", activo: true, email: { not: "" } }, select: { email: true } }),
      req.user?.sub ? prisma.usuarios.findUnique({ where: { id: req.user.sub }, select: { nombre: true } }) : Promise.resolve(null),
    ]);
    const destinatarios = directivos.map((d) => d.email).filter(Boolean);
    if (destinatarios.length > 0) {
      const [y, mo] = periodo.split("-").map(Number);
      const mesTxt = `${MESES[mo - 1]} ${y}`;
      const esc = (s: string) => s.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch] as string));
      const html = `<div style="font-family:sans-serif;color:#222;line-height:1.5">
        <h2 style="color:#0C1B30;margin:0 0 4px">Reapertura de período contable — ${mesTxt}</h2>
        <p style="color:#085041;font-weight:600;margin:0 0 12px">${complejo?.nombre ?? "Residencial"}</p>
        <p>El mes de <b>${mesTxt}</b>, que estaba cerrado contablemente, ha sido <b>reabierto</b>. A partir de ahora se pueden volver a registrar o modificar gastos, cargos y pagos de este período hasta que se cierre nuevamente.</p>
        <table style="border-collapse:collapse;margin:8px 0 4px;font-size:14px">
          <tr><td style="padding:3px 12px 3px 0;color:#888">A solicitud de</td><td style="font-weight:600">${esc(solicitado_por)}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#888">Motivo</td><td>${esc(motivo)}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#888">Reabierto por</td><td>${esc(reabiertoPor?.nombre ?? "Superadministrador")}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#888">Fecha</td><td>${reabiertoAt.toISOString().slice(0, 10)}</td></tr>
        </table>
      </div>`;
      const r = await sendBulkEmails(idc, destinatarios.map((to) => ({ to, subject: `Reapertura de ${mesTxt} — ${complejo?.nombre ?? "Residencial"}`, html })));
      emailResult = { sent: r.sent, configured: r.configured };
    }
  } catch (e) {
    console.error("[cierre] error enviando email de reapertura a directiva:", e);
  }

  res.json({ periodo, cerrado: false, email: emailResult });
});

export default router;
