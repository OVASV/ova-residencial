import { useEffect, useState } from "react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { getTransparencia, getDetalleMes, getSegmentacionDeuda, type TransparenciaData, type DetalleMesData, type SegmentacionDeuda } from "../../api/client";
import MonoAmount from "../../components/ui/MonoAmount";
import { formatCurrency, formatDate } from "../../utils/formatters";

const CAT_LABEL: Record<string, string> = {
  seguridad: "Seguridad",
  limpieza: "Limpieza",
  mantenimiento: "Mantenimiento",
  servicios: "Servicios",
  administrativo: "Administrativo",
  planilla: "Planilla",
  extraordinario: "Extraordinario",
  ajuste: "Ajuste / Saldo inicial",
};

const CAT_COLOR: Record<string, string> = {
  seguridad: "#3B82F6",
  limpieza: "#10B981",
  mantenimiento: "#F59E0B",
  servicios: "#8B5CF6",
  administrativo: "#6B7280",
  planilla: "#0891B2",
  extraordinario: "#EF4444",
  ajuste: "#64748B",
};


function nombreMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es", { month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Transparencia() {
  const [data, setData] = useState<TransparenciaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seg, setSeg] = useState<SegmentacionDeuda | null>(null);
  const [mesAbierto, setMesAbierto] = useState<string | null>(null);
  const [detalleMes, setDetalleMes] = useState<DetalleMesData | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  useEffect(() => {
    getTransparencia()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    getSegmentacionDeuda().then(setSeg).catch(() => {});
  }, []);

  function toggleMes(periodo: string) {
    if (mesAbierto === periodo) {
      setMesAbierto(null);
      setDetalleMes(null);
      return;
    }
    setMesAbierto(periodo);
    setDetalleMes(null);
    setLoadingDetalle(true);
    getDetalleMes(periodo)
      .then(setDetalleMes)
      .catch(() => {})
      .finally(() => setLoadingDetalle(false));
  }

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;
  if (error) return <div className="py-8 text-center text-base text-estado-atrasado">{error}</div>;
  if (!data) return <div className="py-8 text-center text-base text-black/40">No se pudo cargar la información</div>;

  const { kpis, meses, categorias_mes } = data;
  const totalCatMes = categorias_mes.reduce((s, c) => s + c.monto, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Transparencia Financiera</h1>
        <p className="text-base text-black/50">{data.nombre_complejo} — Información abierta para todos los propietarios</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Saldo en caja" value={kpis.saldo_caja} tone={kpis.saldo_caja >= 0 ? "text-emerald-600" : "text-estado-atrasado"} />
        <KpiCard label="Recaudado este mes" value={kpis.recaudado_mes} tone="text-[#085041]" />
        <KpiCard label="Gastado este mes" value={kpis.gastado_mes} tone="text-black/70" />
      </div>

      {/* Segmentación de deuda — idéntico al Dashboard */}
      {seg && (
        <div className="rounded-lg border-[0.5px] border-black/10 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold">Segmentación de deuda</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {seg.rangos.map((r) => {
              const colors: Record<string, string> = {
                mayor_1000: "border-estado-atrasado/30 bg-estado-atrasado/8",
                "500_1000": "border-estado-pendiente/30 bg-estado-pendiente/8",
                "100_500": "border-sidebar-accent/20 bg-sidebar-accent/6",
                menor_100: "border-black/10 bg-black/3",
                a_favor: "border-emerald-500/20 bg-emerald-500/6",
              };
              const textColors: Record<string, string> = {
                mayor_1000: "text-estado-atrasado",
                "500_1000": "text-estado-pendiente",
                "100_500": "text-sidebar-accent",
                menor_100: "text-black/60",
                a_favor: "text-emerald-600",
              };
              return (
                <div key={r.key} className={`rounded-lg border-[0.5px] p-4 ${colors[r.key] ?? "border-black/10 bg-black/3"}`}>
                  <p className="text-etiqueta font-medium uppercase tracking-wide text-black/45">{r.label}</p>
                  <p className={`mt-1 font-mono text-xl font-bold ${textColors[r.key] ?? "text-black/60"}`}>
                    <MonoAmount value={r.total} />
                  </p>
                  <p className="mt-0.5 text-base text-black/45">{r.cantidad} {r.cantidad === 1 ? "propiedad" : "propiedades"}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Distribución de gastos por categoría */}
      <div className="rounded-lg border-[0.5px] border-black/10 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold">¿En qué se gasta? — Mes actual</h2>
        {categorias_mes.length === 0 ? (
          <p className="py-4 text-center text-black/40">Sin gastos registrados este mes</p>
        ) : (
          <div className="space-y-4">
            {categorias_mes.map((c) => {
              const pct = totalCatMes > 0 ? (c.monto / totalCatMes) * 100 : 0;
              const color = CAT_COLOR[c.categoria] ?? "#6B7280";
              return (
                <div key={c.categoria}>
                  <div className="mb-1 flex items-center justify-between text-base">
                    <span className="font-medium">{CAT_LABEL[c.categoria] ?? c.categoria}</span>
                    <span className="font-mono text-black/60">{formatCurrency(c.monto)} <span className="text-etiqueta text-black/40">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  {c.items && c.items.length > 0 && (
                    <div className="mt-1.5 ml-1 space-y-0.5">
                      {c.items.map((it, i) => (
                        <div key={i} className="flex items-center justify-between text-etiqueta text-black/50">
                          <span className="truncate">{it.descripcion}{it.proveedor ? ` — ${it.proveedor}` : ""}</span>
                          <span className="ml-2 shrink-0 font-mono">{formatCurrency(it.monto)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t border-black/10 pt-2 text-base font-semibold">
              <span>Total del mes</span>
              <span className="font-mono">{formatCurrency(totalCatMes)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Detalle mensual — clickeable */}
      <div className="rounded-lg border-[0.5px] border-black/10 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold">Detalle mensual</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-tabla">
            <thead>
              <tr className="border-b border-black/15 text-left text-black/45">
                <th className="py-1.5 font-medium">Mes</th>
                <th className="py-1.5 text-right font-medium">Recaudado</th>
                <th className="py-1.5 text-right font-medium">Gastado</th>
                <th className="py-1.5 text-right font-medium">Diferencia</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => {
                const diff = m.recaudado - m.gastado;
                const abierto = mesAbierto === m.periodo;
                return (
                  <>
                    <tr
                      key={m.periodo}
                      className={`border-b border-black/5 cursor-pointer hover:bg-black/[0.02] transition-colors ${abierto ? "bg-black/[0.02]" : ""}`}
                      onClick={() => toggleMes(m.periodo)}
                    >
                      <td className="py-2 capitalize">{nombreMes(m.periodo)} {m.periodo.split("-")[0]}</td>
                      <td className="py-2 text-right font-mono text-[#085041]">{formatCurrency(m.recaudado)}</td>
                      <td className="py-2 text-right font-mono text-black/60">{formatCurrency(m.gastado)}</td>
                      <td className={`py-2 text-right font-mono font-medium ${diff >= 0 ? "text-emerald-600" : "text-estado-atrasado"}`}>
                        {diff >= 0 ? "+" : ""}{formatCurrency(diff)}
                      </td>
                      <td className="py-2 text-center text-black/30">
                        {abierto ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
                      </td>
                    </tr>
                    {abierto && (
                      <tr key={`${m.periodo}-detail`}>
                        <td colSpan={5} className="bg-surface/50 px-4 py-3">
                          {loadingDetalle ? (
                            <div className="py-2 text-center text-etiqueta text-black/40">Cargando…</div>
                          ) : detalleMes ? (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-base">
                                <span className="font-medium text-[#085041]">Total recaudado</span>
                                <span className="font-mono font-semibold text-[#085041]">{formatCurrency(detalleMes.recaudado)}</span>
                              </div>
                              {detalleMes.gastos.length === 0 ? (
                                <p className="text-etiqueta text-black/40">Sin gastos registrados</p>
                              ) : (
                                <div>
                                  <div className="mb-1.5 text-etiqueta font-medium uppercase tracking-wide text-black/40">Gastos</div>
                                  <div className="space-y-1">
                                    {detalleMes.gastos.map((g, i) => (
                                      <div key={i} className="flex items-center justify-between text-base">
                                        <span className="flex items-center gap-2 truncate">
                                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CAT_COLOR[g.categoria] ?? "#6B7280" }} />
                                          <span className="truncate">
                                            {g.descripcion}{g.proveedor ? ` — ${g.proveedor}` : ""}
                                          </span>
                                          <span className="shrink-0 text-etiqueta text-black/35">{formatDate(g.fecha)}</span>
                                        </span>
                                        <span className="ml-2 shrink-0 font-mono text-black/60">{formatCurrency(g.monto)}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-2 flex items-center justify-between border-t border-black/10 pt-1.5 text-base font-semibold">
                                    <span>Total gastado</span>
                                    <span className="font-mono">{formatCurrency(detalleMes.gastos.reduce((s, g) => s + g.monto, 0))}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-etiqueta text-black/35">
        Esta información se actualiza en tiempo real con cada pago y gasto registrado.
      </p>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border-[0.5px] border-black/10 bg-white p-4">
      <div className="text-etiqueta font-medium uppercase tracking-wide text-black/45">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${tone}`}>{formatCurrency(value)}</div>
    </div>
  );
}
