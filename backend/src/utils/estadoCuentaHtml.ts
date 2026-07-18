import { prisma } from "../db/prisma.js";

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fDate = (d: string | Date) => new Date(d).toLocaleDateString("es-GT", { year: "numeric", month: "2-digit", day: "2-digit" });

interface Mov { fecha: string; concepto: string; cargo: number; abono: number; saldo: number }
interface MesK { periodo: string; label: string; saldo_inicial: number; cargos: number; abonos: number; saldo_final: number; movimientos: Mov[] }

function nombreMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function generarEstadoCuentaHtml(idUnidad: string): Promise<{ html: string; saldo: number; propietario: string } | null> {
  const u = await prisma.unidades.findUnique({
    where: { id: idUnidad },
    include: {
      calles: { select: { nombre: true } },
      bloques: { select: { nombre: true } },
      complejos: { select: { nombre: true, logo_url: true } },
      historial_propietarios: {
        where: { fecha_fin: null },
        include: { propietarios: { select: { nombre: true, apellido: true, telefono: true, email: true } } },
      },
    },
  });
  if (!u) return null;

  const nombreComplejo = u.complejos?.nombre ?? "Residencial";
  const logoUrl = u.complejos?.logo_url ?? null;

  const [cargos, pagos] = await Promise.all([
    prisma.cargos.findMany({
      where: { id_unidad: idUnidad, estado: { not: "anulado" } },
      orderBy: [{ periodo_mes: "asc" }, { concepto: "asc" }],
    }),
    prisma.pagos.findMany({
      where: { id_unidad: idUnidad, estado: { not: "anulado" } },
      orderBy: { fecha_pago: "asc" },
      include: { pago_cargos: { include: { cargos: { select: { concepto: true } } } } },
    }),
  ]);

  const prop = u.historial_propietarios[0]?.propietarios;
  const propNombre = prop ? `${prop.nombre} ${prop.apellido}` : "Sin propietario";

  // Build kardex
  const meses = new Map<string, { cargos: number; abonos: number; movs: Omit<Mov, "saldo">[] }>();
  const get = (k: string) => {
    let g = meses.get(k);
    if (!g) { g = { cargos: 0, abonos: 0, movs: [] }; meses.set(k, g); }
    return g;
  };
  for (const c of cargos) {
    const fecha = (c.periodo_mes instanceof Date ? c.periodo_mes.toISOString() : String(c.periodo_mes)).slice(0, 10);
    const g = get(fecha.slice(0, 7));
    g.cargos = r2(g.cargos + c.monto.toNumber());
    g.movs.push({ fecha, concepto: c.concepto, cargo: c.monto.toNumber(), abono: 0 });
  }
  for (const p of pagos) {
    const fecha = (p.fecha_pago instanceof Date ? p.fecha_pago.toISOString() : String(p.fecha_pago)).slice(0, 10);
    const g = get(fecha.slice(0, 7));
    g.abonos = r2(g.abonos + p.monto_total.toNumber());
    const ref = p.referencia_banco ? ` · ${p.referencia_banco}` : "";
    g.movs.push({ fecha, concepto: `Pago (${p.metodo}${ref})`, cargo: 0, abono: p.monto_total.toNumber() });
  }

  let saldo = 0;
  const kardex: MesK[] = [...meses.keys()].sort().map((k) => {
    const g = meses.get(k)!;
    const saldo_inicial = r2(saldo);
    const movs = g.movs
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((m) => { saldo = r2(saldo + m.cargo - m.abono); return { ...m, saldo }; });
    return { periodo: k, label: nombreMes(k), saldo_inicial, cargos: g.cargos, abonos: g.abonos, saldo_final: r2(saldo), movimientos: movs };
  });

  const saldoFinal = kardex.length ? kardex[kardex.length - 1].saldo_final : 0;
  const hoy = new Date().toLocaleDateString("es-GT", { year: "numeric", month: "long", day: "numeric" });

  // Build HTML table
  const S = {
    table: 'style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;color:#333"',
    th: 'style="padding:6px 8px;text-align:left;border-bottom:2px solid #085041;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#666"',
    thR: 'style="padding:6px 8px;text-align:right;border-bottom:2px solid #085041;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#666"',
    mesRow: 'style="background:#f3f4f6;padding:5px 8px;font-weight:600;color:#085041"',
    td: 'style="padding:4px 8px;border-bottom:1px solid #eee"',
    tdR: 'style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace"',
    tdGreen: 'style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;color:#15803d"',
    subTd: 'style="padding:5px 8px;border-bottom:2px solid #ddd;text-align:right;font-family:monospace;font-weight:600"',
    subGreen: 'style="padding:5px 8px;border-bottom:2px solid #ddd;text-align:right;font-family:monospace;font-weight:600;color:#15803d"',
  };

  let rows = "";
  for (const m of kardex) {
    rows += `<tr><td colspan="4" ${S.mesRow}>${m.label}</td><td ${S.mesRow} style="text-align:right;font-size:10px;color:#999">Inicial: ${fmt(m.saldo_inicial)}</td></tr>`;
    for (const mv of m.movimientos) {
      rows += `<tr>
        <td ${S.td} style="font-family:monospace">${fDate(mv.fecha)}</td>
        <td ${S.td}>${mv.concepto}</td>
        <td ${S.tdR}>${mv.cargo ? fmt(mv.cargo) : ""}</td>
        <td ${mv.abono ? S.tdGreen : S.tdR}>${mv.abono ? fmt(mv.abono) : ""}</td>
        <td ${S.tdR} style="font-weight:500">${fmt(mv.saldo)}</td>
      </tr>`;
    }
    rows += `<tr>
      <td colspan="2" ${S.subTd} style="text-align:right;font-size:10px;text-transform:uppercase;color:#999">Subtotal ${m.label}</td>
      <td ${S.subTd}>${fmt(m.cargos)}</td>
      <td ${S.subGreen}>${fmt(m.abonos)}</td>
      <td ${S.subTd} style="font-weight:700">${fmt(m.saldo_final)}</td>
    </tr>`;
  }

  const saldoColor = saldoFinal > 0 ? "#dc2626" : "#15803d";

  const html = `
<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#333">
  <!-- Header -->
  <div style="border-bottom:3px solid #085041;padding-bottom:12px;margin-bottom:16px">
    <h2 style="margin:0;font-size:20px;color:#0C1B30">Estado de Cuenta</h2>
    <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#085041">${nombreComplejo}</p>
    <p style="margin:4px 0 0;font-size:11px;color:#999">Fecha de emisión: ${hoy}</p>
  </div>

  <!-- Datos propietario -->
  <table style="width:100%;margin-bottom:16px;font-size:12px">
    <tr>
      <td style="padding:4px 0"><strong>Propietario:</strong> ${propNombre}</td>
      <td style="padding:4px 0"><strong>Propiedad:</strong> #${u.numero_propiedad}</td>
    </tr>
    <tr>
      <td style="padding:4px 0"><strong>Calle:</strong> ${u.calles?.nombre ?? "—"}</td>
      <td style="padding:4px 0"><strong>Bloque:</strong> ${u.bloques?.nombre ?? "—"}</td>
    </tr>
  </table>

  <!-- Kardex -->
  <table ${S.table}>
    <thead>
      <tr>
        <th ${S.th}>Fecha</th>
        <th ${S.th}>Concepto</th>
        <th ${S.thR}>Cargo</th>
        <th ${S.thR}>Abono</th>
        <th ${S.thR}>Saldo</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Saldo final -->
  <div style="border-top:3px solid #085041;margin-top:12px;padding-top:12px;text-align:right">
    <span style="font-size:13px;font-weight:600;color:#666">SALDO A LA FECHA</span>
    <span style="font-family:monospace;font-size:20px;font-weight:700;color:${saldoColor};margin-left:12px">${fmt(saldoFinal)}</span>
  </div>

  <p style="margin-top:24px;font-size:10px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:12px">
    Este estado de cuenta fue generado automáticamente el ${hoy}. Para dudas contacte a la administración.
  </p>
</div>`;

  return { html, saldo: saldoFinal, propietario: propNombre };
}
