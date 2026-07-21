import PDFDocument from "pdfkit";
import fs from "node:fs";

export interface ReciboPdfData {
  id: string;
  fecha_pago: Date;
  monto_total: number;
  metodo: string;
  banco_origen: string | null;
  referencia_banco: string | null;
  numero_propiedad: string | null;
  calle: string | null;
  bloque: string | null;
  propietario: string | null;
  concepto: string; // concepto principal (cuota asignada o "Cuota de mantenimiento")
  tipo: string | null; // tipo de propiedad (estado de unidad): casa, en construcción, airbnb, etc.
  cuota_monto: number | null;
  nombre_complejo: string | null;
  logo_path: string | null; // ruta absoluta en disco, opcional
}

const VERDE = "#085041";
const NAVY = "#0C1B30";
const GRIS = "#6b7280";
const LINEA = "#e2e5e2";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fFecha = (d: Date) => d.toISOString().slice(0, 10);

// Genera el recibo en PDF (Buffer), con un diseño equivalente al de impresión.
export function generarReciboPdf(r: ReciboPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const L = doc.page.margins.left;
    const R = doc.page.width - doc.page.margins.right;
    const W = R - L;

    // ---- Encabezado ----
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text("Recibo de Pago", L, 48);
    doc.font("Helvetica").fontSize(9).fillColor(GRIS)
      .text(`Fecha de emisión: ${fFecha(new Date())}`, L, 74);
    doc.fontSize(7.5).fillColor("#9aa0a6").text("NO. DE RECIBO", L, 90);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(VERDE)
      .text(`REC-${r.id.slice(0, 8).toUpperCase()}`, L, 100);

    // Complejo + logo (derecha)
    doc.font("Helvetica-Bold").fontSize(12).fillColor(VERDE)
      .text(r.nombre_complejo ?? "Residencial", L, 52, { width: W, align: "right" });
    if (r.logo_path && fs.existsSync(r.logo_path)) {
      try { doc.image(r.logo_path, R - 44, 70, { fit: [44, 44] }); } catch { /* ignora logo inválido */ }
    }

    doc.moveTo(L, 124).lineTo(R, 124).lineWidth(2).strokeColor(VERDE).stroke();

    // ---- Datos del propietario ----
    let y = 140;
    doc.roundedRect(L, y, W, 58, 4).fillColor("#f7f8f7").fill();
    const col = W / 2;
    campo(doc, "PROPIETARIO", r.propietario ?? "—", L + 14, y + 12, col - 20);
    campo(doc, "UNIDAD", `#${r.numero_propiedad ?? "—"}`, L + col + 6, y + 12, col - 20);
    campo(doc, "CALLE", r.calle ?? "—", L + 14, y + 34, col - 20);
    campo(doc, "BLOQUE", r.bloque ?? "—", L + col + 6, y + 34, col - 20);

    // ---- Detalle del pago ----
    y += 74;
    doc.roundedRect(L, y, W, 58, 4).fillColor("#f7f8f7").fill();
    const c3 = W / 3;
    campo(doc, "FECHA DE PAGO", fFecha(r.fecha_pago), L + 14, y + 12, c3 - 16);
    campo(doc, "MÉTODO", cap(r.metodo), L + c3 + 6, y + 12, c3 - 16);
    campo(doc, "BANCO ORIGEN", r.banco_origen ?? "—", L + c3 * 2 + 6, y + 12, c3 - 16);
    if (r.referencia_banco) campo(doc, "REFERENCIA BANCARIA", r.referencia_banco, L + 14, y + 34, W - 28);

    // ---- Conceptos (una sola línea, como el recibo de impresión) ----
    y += 76;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#9aa0a6");
    doc.text("CONCEPTO", L, y);
    doc.text("TIPO", L + W * 0.42, y);
    doc.text("CUOTA ASIGNADA", L + W * 0.6, y, { width: W * 0.2, align: "right" });
    doc.text("MONTO APLICADO", L + W * 0.8, y, { width: W * 0.2, align: "right" });
    y += 12;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1).strokeColor(VERDE).opacity(0.25).stroke().opacity(1);
    y += 8;
    doc.font("Helvetica").fontSize(10).fillColor("#333");
    doc.text(r.concepto, L, y, { width: W * 0.4 });
    doc.text(r.tipo ?? "—", L + W * 0.42, y, { width: W * 0.16 });
    doc.fillColor(GRIS).text(money(r.cuota_monto ?? r.monto_total), L + W * 0.6, y, { width: W * 0.2, align: "right" });
    doc.fillColor("#333").text(money(r.monto_total), L + W * 0.8, y, { width: W * 0.2, align: "right" });
    y += 24;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(LINEA).stroke();

    // ---- Total ----
    y += 16;
    doc.roundedRect(L, y, W, 40, 4).lineWidth(1.5).strokeColor(VERDE).stroke();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(VERDE)
      .text("TOTAL PAGADO", L + 16, y + 14);
    doc.fontSize(16).fillColor(VERDE)
      .text(money(r.monto_total), R - 180, y + 11, { width: 164, align: "right" });

    // ---- Pie ----
    doc.font("Helvetica").fontSize(8).fillColor("#9aa0a6")
      .text("Este recibo fue generado electrónicamente y no requiere firma ni sello.",
        L, y + 66, { width: W, align: "center" });

    doc.end();
  });
}

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function campo(doc: PDFKit.PDFDocument, label: string, valor: string, x: number, y: number, w: number) {
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#9aa0a6").text(label, x, y, { width: w });
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#2b2b2b").text(valor, x, y + 9, { width: w, ellipsis: true, height: 14 });
}
