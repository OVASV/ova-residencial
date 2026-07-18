import { useEffect, useState, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { IconPrinter } from "@tabler/icons-react";
import { getMisUnidades, getPortalEstadoCuenta, type MiUnidad, type EstadoCuenta, type Cargo, type Pago } from "../../api/client";
import Panel from "../../components/ui/Panel";
import { formatDate, formatCurrency } from "../../utils/formatters";

interface MovK { fecha: string; concepto: string; cargo: number; abono: number; saldo: number; pagoId?: string }
interface MesKardex { periodo: string; label: string; saldo_inicial: number; cargos: number; abonos: number; saldo_final: number; movimientos: MovK[] }

const r2 = (n: number) => Math.round(n * 100) / 100;

function nombreMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function construirKardex(cargos: Cargo[], pagos: Pago[]): MesKardex[] {
  const meses = new Map<string, { cargos: number; abonos: number; movs: Omit<MovK, "saldo">[] }>();
  const get = (k: string) => { let g = meses.get(k); if (!g) { g = { cargos: 0, abonos: 0, movs: [] }; meses.set(k, g); } return g; };
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
    g.movs.push({ fecha, concepto: `Pago (${p.metodo}${ref})`, cargo: 0, abono: Number(p.monto_total), pagoId: p.id });
  }
  let saldo = 0;
  return [...meses.keys()].sort().map((k) => {
    const g = meses.get(k)!;
    const saldo_inicial = r2(saldo);
    const movs = g.movs.sort((a, b) => a.fecha.localeCompare(b.fecha)).map((m) => { saldo = r2(saldo + m.cargo - m.abono); return { ...m, saldo }; });
    return { periodo: k, label: nombreMes(k), saldo_inicial, cargos: g.cargos, abonos: g.abonos, saldo_final: r2(saldo), movimientos: movs };
  });
}

export default function MiEstadoCuenta() {
  const [params, setParams] = useSearchParams();
  const [unidades, setUnidades] = useState<MiUnidad[]>([]);
  const [selected, setSelected] = useState(params.get("unidad") ?? "");
  const [data, setData] = useState<EstadoCuenta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMisUnidades().then((u) => {
      setUnidades(u);
      if (!selected && u.length > 0) setSelected(u[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setData(null);
    setError(null);
    getPortalEstadoCuenta(selected).then(setData).catch((e) => setError(String(e)));
  }, [selected]);

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  const selUnit = unidades.find((u) => u.id === selected);
  const kardex = data ? construirKardex(data.cargos, data.pagos) : [];
  const saldoActual = kardex.length ? kardex[kardex.length - 1].saldo_final : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Estado de Cuenta</h1>
          {selUnit && (
            <p className="text-base text-black/50">
              Unidad #{selUnit.numero_propiedad ?? selUnit.id}
              {selUnit.bloque ? ` · ${selUnit.bloque}` : ""}
              {selUnit.calle ? ` · ${selUnit.calle}` : ""}
            </p>
          )}
          {!selUnit && <p className="text-base text-black/50">Consulta tus cargos y pagos</p>}
        </div>
        <div className="flex items-center gap-2">
          {unidades.length > 1 && (
            <select
              value={selected}
              onChange={(e) => { setSelected(e.target.value); setParams({ unidad: e.target.value }); }}
              className="rounded-md border-[0.5px] border-black/20 bg-white py-1.5 pl-2 pr-7 text-base"
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>#{u.numero_propiedad ?? u.id}</option>
              ))}
            </select>
          )}
          {data && (
            <a
              href={`/pagos/estado-cuenta/${encodeURIComponent(selected)}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md bg-[#085041] px-3 py-1.5 text-base font-medium text-white hover:bg-[#063d32]"
            >
              <IconPrinter size={16} /> Imprimir
            </a>
          )}
        </div>
      </div>

      {error && <div className="rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-3 text-base text-estado-atrasado">{error}</div>}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiBox label="Saldo pendiente" value={data.kpis.saldo_pendiente} highlight={data.kpis.saldo_pendiente > 0} />
            <KpiBox label="Crédito a favor" value={data.kpis.credito_a_favor} />
            <KpiBox label="Pagado en el año" value={data.kpis.total_pagado_anio} />
            <KpiBox label="Último pago" text={data.kpis.ultimo_pago ? formatDate(data.kpis.ultimo_pago) : "—"} />
          </div>

          {/* Kardex */}
          <Panel title="Movimientos">
            {kardex.length === 0 ? (
              <p className="py-4 text-center text-black/40">Sin movimientos registrados</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-tabla">
                  <thead>
                    <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                      <th className="py-1.5 font-medium">Fecha</th>
                      <th className="py-1.5 font-medium">Concepto</th>
                      <th className="py-1.5 text-right font-medium">Cargo</th>
                      <th className="py-1.5 text-right font-medium">Abono</th>
                      <th className="py-1.5 text-right font-medium">Saldo</th>
                      <th className="py-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {kardex.map((m) => (
                      <Fragment key={m.periodo}>
                        <tr className="bg-black/[0.02]">
                          <td colSpan={4} className="py-1.5 font-semibold text-[#085041]">{m.label}</td>
                          <td className="py-1.5 text-right text-etiqueta text-black/40">Inicial: {formatCurrency(m.saldo_inicial)}</td>
                          <td></td>
                        </tr>
                        {m.movimientos.map((mv, i) => (
                          <tr key={i} className="border-b-[0.5px] border-black/5">
                            <td className="py-1.5 font-mono">{formatDate(mv.fecha)}</td>
                            <td className="py-1.5">{mv.concepto}</td>
                            <td className="py-1.5 text-right font-mono">{mv.cargo ? formatCurrency(mv.cargo) : ""}</td>
                            <td className="py-1.5 text-right font-mono text-estado-pagado">{mv.abono ? formatCurrency(mv.abono) : ""}</td>
                            <td className="py-1.5 text-right font-mono font-medium">{formatCurrency(mv.saldo)}</td>
                            <td className="py-1.5">
                              {mv.pagoId && (
                                <a
                                  href={`/pagos/recibo/pdf?ids=${mv.pagoId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Imprimir recibo"
                                  className="inline-flex rounded p-0.5 text-black/40 hover:bg-black/5 hover:text-[#085041]"
                                >
                                  <IconPrinter size={14} />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Saldo */}
          <div className="flex items-center justify-end gap-3 rounded-lg border-[0.5px] border-black/10 bg-white p-4">
            <span className="text-base font-semibold text-black/60">SALDO A LA FECHA</span>
            <span className={`font-mono text-xl font-bold ${saldoActual > 0 ? "text-estado-atrasado" : "text-estado-pagado"}`}>
              {formatCurrency(saldoActual)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function KpiBox({ label, value, text, highlight }: { label: string; value?: number; text?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border-[0.5px] p-3 ${highlight ? "border-estado-atrasado/30 bg-estado-atrasado/5" : "border-black/10 bg-white"}`}>
      <div className="text-etiqueta font-medium uppercase tracking-wide text-black/45">{label}</div>
      <div className={`mt-1 font-mono text-lg font-bold ${highlight ? "text-estado-atrasado" : "text-black/80"}`}>
        {text ?? formatCurrency(value ?? 0)}
      </div>
    </div>
  );
}
