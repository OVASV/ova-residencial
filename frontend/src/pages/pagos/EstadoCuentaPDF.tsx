import { useEffect, useState, Fragment } from "react";
import { useParams } from "react-router-dom";
import { IconPrinter, IconArrowLeft } from "@tabler/icons-react";
import { getEstadoCuenta, type EstadoCuenta as ECData, type Cargo, type Pago } from "../../api/client";
import { formatDate, formatCurrency } from "../../utils/formatters";

const r2 = (n: number) => Math.round(n * 100) / 100;

interface MovK { fecha: string; concepto: string; cargo: number; abono: number; saldo: number }
interface MesKardex { periodo: string; saldo_inicial: number; cargos: number; abonos: number; saldo_final: number; movimientos: MovK[] }

function construirKardex(cargos: Cargo[], pagos: Pago[]): MesKardex[] {
  const meses = new Map<string, { cargos: number; abonos: number; movs: Omit<MovK, "saldo">[] }>();
  const get = (k: string) => {
    let g = meses.get(k);
    if (!g) { g = { cargos: 0, abonos: 0, movs: [] }; meses.set(k, g); }
    return g;
  };
  for (const c of cargos) {
    const fecha = String(c.periodo_mes).slice(0, 10);
    const g = get(fecha.slice(0, 7));
    g.cargos = r2(g.cargos + Number(c.monto));
    g.movs.push({ fecha, concepto: c.concepto, cargo: Number(c.monto), abono: 0 });
  }
  for (const p of pagos) {
    const fecha = String(p.fecha_pago).slice(0, 10);
    const g = get(fecha.slice(0, 7));
    g.abonos = r2(g.abonos + Number(p.monto_total));
    const ref = p.referencia_banco ? ` · ${p.referencia_banco}` : "";
    g.movs.push({ fecha, concepto: `Pago (${p.metodo}${ref})`, cargo: 0, abono: Number(p.monto_total) });
  }
  let saldo = 0;
  return [...meses.keys()].sort().map((k) => {
    const g = meses.get(k)!;
    const saldo_inicial = r2(saldo);
    const movs = g.movs
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((m) => { saldo = r2(saldo + m.cargo - m.abono); return { ...m, saldo }; });
    return { periodo: k, saldo_inicial, cargos: g.cargos, abonos: g.abonos, saldo_final: r2(saldo), movimientos: movs };
  });
}

function nombreMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const hoy = () => new Date().toLocaleDateString("es-GT", { year: "numeric", month: "long", day: "numeric" });

export default function EstadoCuentaPDF() {
  const { idUnidad } = useParams();
  const [data, setData] = useState<ECData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idUnidad) return;
    getEstadoCuenta(idUnidad).then(setData).catch((e) => setError(String(e)));
  }, [idUnidad]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return <div className="flex h-screen items-center justify-center text-gray-400">Cargando estado de cuenta…</div>;

  const { unidad, kpis, cargos, pagos } = data;
  const prop = unidad.propietario_actual;
  const kardex = construirKardex(cargos, pagos);
  const saldoActual = kardex.length ? kardex[kardex.length - 1].saldo_final : 0;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .ec-page { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
        }
        @page { size: letter; margin: 15mm 12mm; }
      `}</style>

      {/* Toolbar — hidden on print */}
      <div className="no-print sticky top-0 z-50 flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <button
          onClick={() => window.close()}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
        >
          <IconArrowLeft size={16} /> Cerrar
        </button>
        <div className="flex-1" />
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-md bg-[#085041] px-4 py-2 text-sm font-medium text-white hover:bg-[#063d32]"
        >
          <IconPrinter size={16} /> Imprimir / Guardar PDF
        </button>
      </div>

      {/* PDF content */}
      <div className="ec-page mx-auto max-w-[800px] bg-white p-8 font-[Inter,sans-serif] text-[11px] leading-[1.45] text-gray-800">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between border-b-2 border-[#085041] pb-4">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-[#0C1B30]">Estado de Cuenta</h1>
            <p className="mt-0.5 text-[11px] text-gray-500">Fecha de emisión: {hoy()}</p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div className="text-[14px] font-semibold text-[#085041]">{data.nombre_complejo ?? "Residencial"}</div>
            {data.logo_url && <img src={data.logo_url} alt="" className="h-12 w-12 rounded-md object-contain" />}
          </div>
        </div>

        {/* Datos del propietario */}
        <div className="mb-5 grid grid-cols-2 gap-x-8 gap-y-1 rounded-md border border-gray-200 bg-gray-50 p-4">
          <div>
            <Label>Propietario</Label>
            <Value>{prop ? `${prop.nombre} ${prop.apellido}` : "Sin propietario asignado"}</Value>
          </div>
          <div>
            <Label>Unidad / Propiedad</Label>
            <Value>{unidad.numero_propiedad ?? unidad.id}</Value>
          </div>
          <div>
            <Label>Calle</Label>
            <Value>{unidad.calle ?? "—"}</Value>
          </div>
          <div>
            <Label>Bloque</Label>
            <Value>{unidad.bloque ?? "—"}</Value>
          </div>
          <div>
            <Label>Categoría</Label>
            <Value>{unidad.estado_actual?.nombre ?? "—"}</Value>
          </div>
          {prop?.telefono && (
            <div>
              <Label>Teléfono</Label>
              <Value>{prop.telefono}</Value>
            </div>
          )}
          {prop?.email && (
            <div>
              <Label>Email</Label>
              <Value>{prop.email}</Value>
            </div>
          )}
        </div>

        {/* Resumen financiero */}
        <div className="mb-5 grid grid-cols-5 gap-3">
          <SummaryBox label="Saldo pendiente" value={kpis.saldo_pendiente} highlight />
          <SummaryBox label="Crédito a favor" value={kpis.credito_a_favor} />
          <SummaryBox label="Pagado en el año" value={kpis.total_pagado_anio} />
          <SummaryBox label="Total histórico" value={kpis.total_historico} />
          <div className="rounded-md border border-gray-200 p-3">
            <div className="text-[9px] font-medium uppercase tracking-wider text-gray-400">Último pago</div>
            <div className="mt-1 font-mono text-[12px] font-semibold">{kpis.ultimo_pago ? formatDate(kpis.ultimo_pago) : "—"}</div>
          </div>
        </div>

        {/* Kardex */}
        <h2 className="mb-2 text-[13px] font-bold text-[#0C1B30]">Kardex — Movimientos por mes</h2>
        {kardex.length === 0 ? (
          <p className="py-4 text-center text-gray-400">Sin movimientos registrados</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-gray-300 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-500">
                <th className="py-1.5">Fecha</th>
                <th className="py-1.5">Concepto</th>
                <th className="py-1.5 text-right">Cargo</th>
                <th className="py-1.5 text-right">Abono</th>
                <th className="py-1.5 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {kardex.map((m) => (
                <Fragment key={m.periodo}>
                  <tr className="bg-gray-100">
                    <td colSpan={4} className="py-1 font-semibold text-[#085041]">{nombreMes(m.periodo)}</td>
                    <td className="py-1 text-right text-[9px] text-gray-400">Inicial: {formatCurrency(m.saldo_inicial)}</td>
                  </tr>
                  {m.movimientos.map((mv, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 font-mono">{formatDate(mv.fecha)}</td>
                      <td className="py-1">{mv.concepto}</td>
                      <td className="py-1 text-right font-mono">{mv.cargo ? formatCurrency(mv.cargo) : ""}</td>
                      <td className="py-1 text-right font-mono text-green-700">{mv.abono ? formatCurrency(mv.abono) : ""}</td>
                      <td className="py-1 text-right font-mono font-medium">{formatCurrency(mv.saldo)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-gray-300">
                    <td colSpan={2} className="py-1 text-right text-[9px] font-medium uppercase text-gray-400">
                      Subtotal {nombreMes(m.periodo)}
                    </td>
                    <td className="py-1 text-right font-mono font-semibold">{formatCurrency(m.cargos)}</td>
                    <td className="py-1 text-right font-mono font-semibold text-green-700">{formatCurrency(m.abonos)}</td>
                    <td className="py-1 text-right font-mono font-bold">{formatCurrency(m.saldo_final)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        {/* Saldo final */}
        <div className="flex items-center justify-end gap-3 border-t-2 border-[#085041] pt-3">
          <span className="text-[12px] font-semibold text-gray-600">SALDO A LA FECHA</span>
          <span className={`font-mono text-[18px] font-bold ${saldoActual > 0 ? "text-red-600" : "text-green-700"}`}>
            {formatCurrency(saldoActual)}
          </span>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-gray-200 pt-3 text-center text-[9px] text-gray-400">
          Este documento es un estado de cuenta generado automáticamente al {hoy()}.
          Para dudas o aclaraciones contacte a la administración.
        </div>
      </div>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-medium uppercase tracking-wider text-gray-400">{children}</div>;
}

function Value({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-semibold text-gray-800">{children}</div>;
}

function SummaryBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
      <div className="text-[9px] font-medium uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 font-mono text-[14px] font-bold ${highlight ? "text-red-600" : "text-gray-800"}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}
