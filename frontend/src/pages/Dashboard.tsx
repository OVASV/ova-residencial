import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconCash,

  IconReceipt2,
  IconBuildingEstate,
  IconChevronRight,
  IconPhoneCall,
  IconBook,
} from "@tabler/icons-react";
import KpiCard from "../components/ui/KpiCard";
import Panel from "../components/ui/Panel";
import EmptyState from "../components/ui/EmptyState";
import MonoAmount from "../components/ui/MonoAmount";
import { getResumenDashboard, getSegmentacionDeuda, getEficienciaCobros, getCobranzaResumen, getProyeccionFlujo, type ResumenDashboard, type SegmentacionDeuda, type EficienciaMes, type CobranzaResumen, type ProyeccionFlujo } from "../api/client";
import { formatDate, formatCurrency } from "../utils/formatters";

const ESTADO_BADGE: Record<string, string> = {
  pagado: "bg-estado-pagado/12 text-estado-pagado",
  pendiente: "bg-estado-pendiente/15 text-estado-pendiente",
  atrasado: "bg-estado-atrasado/12 text-estado-atrasado",
  sin_cargos: "bg-black/5 text-black/40",
  a_favor: "bg-emerald-500/12 text-emerald-600",
};

// Dashboard principal — sección 7.1, con datos reales del mes en curso.
export default function Dashboard() {
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<ResumenDashboard | null>(null);
  const [seg, setSeg] = useState<SegmentacionDeuda | null>(null);
  const [efi, setEfi] = useState<EficienciaMes[]>([]);
  const [cob, setCob] = useState<CobranzaResumen | null>(null);
  const [proy, setProy] = useState<ProyeccionFlujo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    getResumenDashboard(periodo).then(setData).catch((e) => setError(String(e)));
    getSegmentacionDeuda(periodo).then(setSeg).catch(() => {});
    getEficienciaCobros(13, periodo).then(setEfi).catch(() => {});
    getCobranzaResumen().then(setCob).catch(() => {});
    getProyeccionFlujo(6, periodo).then(setProy).catch(() => {});
  }, [periodo]);

  const k = data?.kpis;
  const dist = data?.distribucion;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-base text-black/50">
            Resumen del mes {data ? <span className="font-mono">{data.periodo}</span> : "en curso"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/libro-caja"
            className="inline-flex items-center gap-1 rounded-md border border-black/15 bg-white px-3 py-1.5 text-base font-medium text-sidebar-accent shadow-sm hover:bg-sidebar-accent/5"
          >
            <IconBook size={16} /> Libro de caja
          </Link>
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-md border border-black/15 bg-white px-3 py-1.5 font-mono text-base text-ink shadow-sm focus:border-sidebar-accent focus:outline-none focus:ring-1 focus:ring-sidebar-accent"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-3 text-base text-estado-atrasado">
          {error}
        </div>
      )}

      {/* 4 cards KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Cobrado del mes" value={k?.cobrado_mes ?? 0} tone="pagado" icon={<IconCash size={18} />} subValue={k?.esperado_mes} subLabel="Esperado" />
        <KpiCard label="Cobrado acumulado" value={k?.cobrado_acum ?? 0} tone="pagado" icon={<IconCash size={18} />} subValue={k?.esperado_acum} subLabel="Esperado" />
        <KpiCard label="Gastos del mes" value={k?.gastos_mes ?? 0} tone="atrasado" icon={<IconReceipt2 size={18} />} subValue={k?.presupuesto_mes} subLabel="Presupuesto" mode="gasto" href={`/gastos/reporte?periodo=${periodo}`} newTab linkLabel="Ver reporte" />
        <KpiCard label="Gastos del año" value={k?.gastos_anio ?? 0} tone="atrasado" icon={<IconReceipt2 size={18} />} subValue={k?.presupuesto_anio} subLabel="Presupuesto" mode="gasto" href={`/gastos/reporte?periodo=${periodo}&desde=${periodo.slice(0, 4)}-01`} newTab linkLabel="Ver reporte" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Donut de distribución */}
        <Panel title="Distribución del mes" className="lg:col-span-3">
          <div className="flex flex-col items-center gap-4">
            <Donut dist={dist} />
            <ul className="w-full space-y-1.5">
              <LegendRow color="bg-estado-pagado" label="Cobrado" value={`${dist?.pagado ?? 0}%`} />
              <LegendRow color="bg-estado-pendiente" label="Pendiente" value={`${dist?.pendiente ?? 0}%`} />
            </ul>
          </div>
        </Panel>

        {/* Eficiencia de cobros */}
        {efi.length > 0 && (
          <Panel title="Eficiencia de cobros" className="lg:col-span-5">
            <EficienciaChart data={efi} />
          </Panel>
        )}

        {/* Proyección de flujo de caja (compacto) */}
        {proy && <ProyeccionPanel proy={proy} className="lg:col-span-4" />}
      </div>

      {/* Fila: Pagos recientes + Cobranza */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Pagos recientes">
          {!data || data.pagos_recientes.length === 0 ? (
            <EmptyState icon={<IconReceipt2 size={28} stroke={1.5} />} title="Sin pagos registrados" />
          ) : (
            <ul className="divide-y divide-black/5">
              {data.pagos_recientes.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-base">
                      <span className="font-mono font-medium">Lote {p.numero_propiedad ?? p.id_unidad}</span>
                      {p.propietario && <span className="text-black/60"> · {p.propietario}</span>}
                      {p.categoria && <span className="ml-1 rounded-full bg-sidebar-accent/10 px-1.5 py-0.5 text-etiqueta font-medium text-sidebar-accent">{p.categoria}</span>}
                    </div>
                    <div className="text-etiqueta tracking-wide text-black/40">
                      {formatDate(p.fecha_pago)} · {p.metodo} · {p.conceptos || "—"}
                    </div>
                  </div>
                  <MonoAmount value={Number(p.monto_total)} className="font-semibold text-estado-pagado" />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Cobranza: gestiones + semáforo de promesas */}
        {cob && (
          <Panel
            title="Cobranza"
            action={
              <div className="flex items-center gap-3">
                <Link to="/cobranza/bitacora" className="text-etiqueta font-medium text-black/50 hover:underline">Bitácora</Link>
                <Link to="/cobranza" className="inline-flex items-center gap-0.5 text-etiqueta font-medium text-sidebar-accent hover:underline">
                  Ir a cobranza <IconChevronRight size={14} />
                </Link>
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border-[0.5px] border-black/10 p-3">
                <div className="flex items-center gap-1.5 text-etiqueta uppercase tracking-wide text-black/45"><IconPhoneCall size={13} /> Gestiones (mes)</div>
                <div className="mt-1 font-mono text-xl font-bold text-ink">{cob.gestiones_mes}</div>
                <div className="text-etiqueta text-black/40">{cob.total_gestiones} en total</div>
              </div>
              <SemaforoBox label="Promesas vencidas" value={cob.promesas.vencidas} tone="atrasado" />
              <SemaforoBox label="Vencen hoy" value={cob.promesas.hoy} tone="pendiente" />
              <SemaforoBox label="Promesas próximas" value={cob.promesas.proximas} tone="accent" />
            </div>
          </Panel>
        )}
      </div>

      {/* Segmentación de deuda */}
      {seg && seg.rangos.some((r) => r.cantidad > 0) && (
        <Panel title="Segmentación de deuda">
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
                <div key={r.key} className={`rounded-lg border-[0.5px] p-4 ${colors[r.key]}`}>
                  <p className="text-etiqueta font-medium uppercase tracking-wide text-black/45">{r.label}</p>
                  <p className={`mt-1 font-mono text-xl font-bold ${textColors[r.key]}`}>
                    <MonoAmount value={r.total} />
                  </p>
                  <p className="mt-0.5 text-base text-black/45">{r.cantidad} {r.cantidad === 1 ? "propiedad" : "propiedades"}</p>
                  {r.cantidad > 0 && (
                    <Link
                      to={`/deuda?rango=${r.key}`}
                      className={`mt-2 inline-flex items-center gap-0.5 text-etiqueta font-medium ${textColors[r.key]} hover:underline`}
                    >
                      Ver detalle <IconChevronRight size={14} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Estado por unidad */}
      <Panel title="Estado por unidad">
        {!data || data.estado_por_unidad.length === 0 ? (
          <EmptyState
            icon={<IconBuildingEstate size={28} stroke={1.5} />}
            title="Aún no hay unidades registradas"
            hint={<>Crea unidades en <Link to="/residentes" className="text-sidebar-accent underline">Residentes</Link></>}
          />
        ) : (
          <table className="w-full text-tabla">
            <thead>
              <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                <th className="py-1.5 font-medium"># Propiedad</th>
                <th className="py-1.5 font-medium">Propietario</th>
                <th className="py-1.5 font-medium">Bloque</th>
                <th className="py-1.5 font-medium">Calle</th>
                <th className="py-1.5 text-right font-medium">Saldo</th>
                <th className="py-1.5 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.estado_por_unidad.map((u) => (
                <tr key={u.id} className="border-b-[0.5px] border-black/5">
                  <td className="py-2 font-mono font-medium">{u.numero_propiedad ?? u.id}</td>
                  <td className="py-2">{u.propietario ?? <span className="text-black/35">—</span>}</td>
                  <td className="py-2">{u.bloque}</td>
                  <td className="py-2 text-black/60">{u.calle ?? "—"}</td>
                  <td className="py-2 text-right"><MonoAmount value={Number(u.saldo)} /></td>
                  <td className="py-2 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${ESTADO_BADGE[u.estado]}`}>
                      {u.estado === "sin_cargos" ? "sin cargos" : u.estado === "a_favor" ? "a favor" : u.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function ProyeccionPanel({ proy, className }: { proy: ProyeccionFlujo; className?: string }) {
  const [hoverI, setHoverI] = useState<number | null>(null);
  const [tasaMora, setTasaMora] = useState(proy.tasa_recuperacion || 10);
  const hist = proy.historico ?? [];
  const idxHoy = hist.length; // posición del punto "Hoy"
  const puntos = [...hist, { label: proy.label_ancla, caja_fin: proy.caja_inicial }, ...proy.proyeccion];
  // Línea con recuperación de mora, recalculada en vivo según el slider.
  const puntosMora = (() => {
    const arr = [proy.caja_inicial];
    let cajaM = proy.caja_inicial;
    let moraRest = proy.mora_actual;
    const flujoMes = proy.ingreso_mensual - proy.gasto_mensual;
    for (let i = 0; i < proy.proyeccion.length; i++) {
      const rec = moraRest * (tasaMora / 100);
      moraRest -= rec;
      cajaM = Math.round((cajaM + flujoMes + rec) * 100) / 100;
      arr.push(cajaM);
    }
    return arr;
  })();
  const todos = [...puntos.map((p) => p.caja_fin), ...puntosMora];
  const min = Math.min(...todos, 0);
  const max = Math.max(...todos, 0);
  const rango = max - min || 1;
  const W = 460, H = 100, padY = 12;
  const x = (i: number) => (i / (puntos.length - 1)) * W;
  const y = (v: number) => padY + (1 - (v - min) / rango) * (H - 2 * padY);
  const lineaReal = puntos.slice(0, idxHoy + 1).map((p, i) => `${x(i)},${y(p.caja_fin)}`).join(" ");
  const lineaProy = puntos.slice(idxHoy).map((p, i) => `${x(i + idxHoy)},${y(p.caja_fin)}`).join(" ");
  const lineaMora = puntosMora.map((v, i) => `${x(i + idxHoy)},${y(v)}`).join(" ");
  const kfmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v).toString());
  const y0 = y(0);
  const flujoPos = proy.flujo_neto >= 0;

  return (
    <Panel title="Proyección de flujo de caja" className={className}>
      {proy.mes_negativo ? (
        <div className="mb-3 rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-2.5 text-etiqueta text-estado-atrasado">
          ⚠ Con la tasa de cobro actual ({proy.tasa_cobro}%), la caja se vuelve <b>negativa en {proy.mes_negativo}</b>.
        </div>
      ) : (
        <div className="mb-3 rounded-md border-[0.5px] border-estado-pagado/30 bg-estado-pagado/10 p-2.5 text-etiqueta text-estado-pagado">
          ✓ Flujo {flujoPos ? "positivo" : "negativo"}: la caja {flujoPos ? "crece" : "baja"} <MonoAmount value={Math.abs(proy.flujo_neto)} className="inline font-semibold" />/mes (cobro {proy.tasa_cobro}%).
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <MiniStat label={`Caja a ${proy.label_ancla}`} value={formatCurrency(proy.caja_inicial)} />
        <MiniStat label={`Ingreso est. (${proy.tasa_cobro}%)`} value={formatCurrency(proy.ingreso_mensual)} tone="text-estado-pagado" />
        <MiniStat label="Gasto est. / mes" value={formatCurrency(proy.gasto_mensual)} tone="text-estado-atrasado" />
        <MiniStat label="Flujo neto / mes" value={`${flujoPos ? "+" : ""}${formatCurrency(proy.flujo_neto)}`} tone={flujoPos ? "text-estado-pagado" : "text-estado-atrasado"} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-etiqueta text-black/45 whitespace-nowrap">Recuperación de mora</span>
        <input type="range" min={0} max={30} step={1} value={tasaMora} onChange={(e) => setTasaMora(Number(e.target.value))} className="flex-1 accent-[#1D9E75]" />
        <span className="w-16 text-right font-mono text-base font-semibold text-[#1D9E75]">{tasaMora}%/mes</span>
      </div>
      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {min < 0 && max > 0 && <line x1={0} x2={W} y1={y0} y2={y0} stroke="#E24B4A" strokeWidth={0.6} strokeDasharray="3 3" />}
          {/* Con recuperación de mora (por encima) */}
          <polyline fill="none" stroke="#1D9E75" strokeWidth={1.3} strokeLinejoin="round" strokeDasharray="1 2.5" points={lineaMora} />
          {/* Real (últimos 6 meses) */}
          <polyline fill="none" stroke="#085041" strokeWidth={1.6} strokeLinejoin="round" points={lineaReal} />
          {/* Proyección conservadora */}
          <polyline fill="none" stroke="#085041" strokeWidth={1.4} strokeLinejoin="round" strokeDasharray="4 3" opacity={0.55} points={lineaProy} />
          {/* puntos + valor en miles de la línea principal (real + conservadora) */}
          {puntos.map((p, i) => {
            const esHoy = i === idxHoy;
            const arriba = i >= idxHoy; // etiquetas de la conservadora van abajo para no chocar con la de mora
            return (
              <g key={i}>
                <circle cx={x(i)} cy={y(p.caja_fin)} r={esHoy ? 2.8 : 1.8} fill={p.caja_fin < 0 ? "#E24B4A" : "#085041"} opacity={i > idxHoy ? 0.6 : 1} />
                {esHoy && <circle cx={x(i)} cy={y(p.caja_fin)} r={4.5} fill="none" stroke="#085041" strokeWidth={0.8} />}
                <text x={x(i)} y={arriba ? y(p.caja_fin) + 9 : y(p.caja_fin) - 4} textAnchor="middle" fontSize={5.8} fontFamily="JetBrains Mono, monospace" className="fill-black/50">{kfmt(p.caja_fin)}</text>
                <text x={x(i)} y={H + 12} textAnchor="middle" fontSize={6.5} className={esHoy ? "fill-sidebar-accent font-semibold" : "fill-black/45"}>{p.label.split(" ")[0]}</text>
              </g>
            );
          })}
          {/* valor en miles de la línea con mora (encima) */}
          {puntosMora.map((v, i) => i === 0 ? null : (
            <text key={i} x={x(i + idxHoy)} y={y(v) - 4} textAnchor="middle" fontSize={5.8} fontFamily="JetBrains Mono, monospace" className="fill-[#1D9E75]">{kfmt(v)}</text>
          ))}
          {/* bandas transparentes para el hover */}
          {puntos.map((_, i) => {
            const colW = W / (puntos.length - 1);
            return (
              <rect key={i} x={x(i) - colW / 2} y={0} width={colW} height={H + 22} fill="transparent"
                onMouseEnter={() => setHoverI(i)} onMouseLeave={() => setHoverI(null)} style={{ cursor: "pointer" }} />
            );
          })}
          {hoverI !== null && <line x1={x(hoverI)} x2={x(hoverI)} y1={0} y2={H} stroke="#0C1B30" strokeWidth={0.5} strokeDasharray="2 2" opacity={0.4} />}
        </svg>
        {hoverI !== null && (() => {
          const p = puntos[hoverI];
          const conMora = hoverI > idxHoy ? puntosMora[hoverI - idxHoy] : null;
          return (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border-[0.5px] border-black/15 bg-white px-2.5 py-1.5 text-etiqueta shadow-lg"
              style={{ left: `${(x(hoverI) / W) * 100}%`, top: `${(y(Math.max(p.caja_fin, conMora ?? p.caja_fin)) / (H + 22)) * 100}%` }}
            >
              <div className="font-semibold text-ink">{p.label}</div>
              <div className="text-black/60">{hoverI < idxHoy ? "Real" : hoverI === idxHoy ? "Caja al mes" : "Proyectado"}: <span className="font-mono font-medium text-ink">{formatCurrency(p.caja_fin)}</span></div>
              {conMora !== null && <div className="text-[#1D9E75]">Con cobranza mora: <span className="font-mono font-medium">{formatCurrency(conMora)}</span></div>}
            </div>
          );
        })()}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-etiqueta text-black/45">
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-sidebar" /> Real (6 meses)</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dashed border-sidebar" /> Proyectado</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dotted border-[#1D9E75]" /> Con cobranza de mora ({tasaMora}%)</span>
        </div>
      </div>
    </Panel>
  );
}

function MiniStat({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border-[0.5px] border-black/10 p-3">
      <div className="text-etiqueta uppercase tracking-wide text-black/45">{label}</div>
      <div className={`mt-1 font-mono text-base font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function SemaforoBox({ label, value, tone }: { label: string; value: number; tone: "atrasado" | "pendiente" | "accent" }) {
  const styles: Record<string, { box: string; text: string; dot: string }> = {
    atrasado: { box: "border-estado-atrasado/30 bg-estado-atrasado/8", text: "text-estado-atrasado", dot: "bg-estado-atrasado" },
    pendiente: { box: "border-estado-pendiente/30 bg-estado-pendiente/8", text: "text-estado-pendiente", dot: "bg-estado-pendiente" },
    accent: { box: "border-sidebar-accent/20 bg-sidebar-accent/6", text: "text-sidebar-accent", dot: "bg-sidebar-accent" },
  };
  const s = styles[tone];
  return (
    <div className={`rounded-lg border-[0.5px] p-3 ${s.box}`}>
      <div className="flex items-center gap-1.5 text-etiqueta uppercase tracking-wide text-black/45">
        <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {label}
      </div>
      <div className={`mt-1 font-mono text-xl font-bold ${s.text}`}>{value}</div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <li className="flex items-center justify-between text-base">
      <span className="flex items-center gap-2 text-black/60">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className="font-mono tabular-nums text-black/45">{value}</span>
    </li>
  );
}

function EficienciaChart({ data }: { data: EficienciaMes[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxVal = Math.max(...data.map((d) => Math.max(d.esperado, d.recaudado)), 1);
  const chartH = 180;
  const topPad = 20;
  const botPad = 40;
  const innerH = chartH - topPad - botPad;
  const colW = (455 - 36) / data.length;

  const formatMes = (p: string) => {
    const [, m] = p.split("-");
    const nombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return nombres[parseInt(m, 10) - 1] ?? m;
  };

  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;
  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));

  return (
    <div className="relative overflow-x-auto">
      <svg viewBox={`0 0 460 ${chartH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((f) => {
          const y = topPad + innerH * (1 - f);
          return (
            <g key={f}>
              <line x1={32} x2={455} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
              <text x={29} y={y + 3} textAnchor="end" className="fill-black/30" fontSize={7} fontFamily="JetBrains Mono, monospace">
                {fmt(Math.round(maxVal * f))}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const colW = (455 - 36) / data.length;
          const x = 36 + i * colW;
          const w = colW * 0.55;
          const hCobrado = (d.cobrado / maxVal) * innerH;
          const hPendiente = (d.pendiente / maxVal) * innerH;
          const yPendiente = topPad + innerH - hCobrado - hPendiente;
          const yCobrado = topPad + innerH - hCobrado;

          return (
            <g key={d.periodo}>
              {hPendiente > 0 && (
                <rect x={x} y={yPendiente} width={w} height={hPendiente} rx={1.5} fill="#EF9F27" opacity={0.7} />
              )}
              {hCobrado > 0 && (
                <rect x={x} y={yCobrado} width={w} height={hCobrado} rx={1.5} fill="#1D9E75" />
              )}
              <text
                x={x + w / 2}
                y={Math.max(yPendiente - 9, topPad - 8)}
                textAnchor="middle"
                fontSize={6}
                fontFamily="JetBrains Mono, monospace"
                className="fill-estado-pagado"
                fontWeight={600}
              >
                {fmtK(d.recaudado)}
              </text>
              <text
                x={x + w / 2}
                y={Math.max(yPendiente - 3, topPad - 2)}
                textAnchor="middle"
                fontSize={6.5}
                fontFamily="JetBrains Mono, monospace"
                className="fill-black/45"
                fontWeight={600}
              >
                {d.eficiencia}%
              </text>
              <text x={x + w / 2} y={topPad + innerH + 12} textAnchor="middle" fontSize={7} className={hover === i ? "fill-sidebar-accent font-semibold" : "fill-black/50"}>
                {formatMes(d.periodo)}
              </text>
              {(i === 0 || d.periodo.endsWith("-01")) && (
                <text x={x + w / 2} y={topPad + innerH + 22} textAnchor="middle" fontSize={6} className="fill-black/30" fontFamily="JetBrains Mono, monospace">
                  {d.periodo.slice(0, 4)}
                </text>
              )}
            </g>
          );
        })}

        <polyline
          fill="none"
          stroke="#085041"
          strokeWidth={1.2}
          strokeLinejoin="round"
          points={data
            .map((d, i) => {
              const colW = (455 - 36) / data.length;
              const x = 36 + i * colW + colW * 0.275;
              const y = topPad + innerH - (d.eficiencia / 100) * innerH;
              return `${x},${y}`;
            })
            .join(" ")}
        />
        {data.map((d, i) => {
          const x = 36 + i * colW + colW * 0.275;
          const y = topPad + innerH - (d.eficiencia / 100) * innerH;
          return <circle key={i} cx={x} cy={y} r={2} fill="#085041" />;
        })}

        {/* bandas transparentes para el hover */}
        {data.map((_, i) => (
          <rect key={"h" + i} x={36 + i * colW - colW * 0.1} y={topPad} width={colW} height={innerH} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }} />
        ))}
      </svg>

      {hover !== null && (() => {
        const d = data[hover];
        const cx = 36 + hover * colW + colW * 0.275;
        return (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border-[0.5px] border-black/15 bg-white px-2.5 py-1.5 text-etiqueta shadow-lg"
            style={{ left: `${(cx / 460) * 100}%`, top: "4px" }}>
            <div className="font-semibold text-ink">{d.periodo}</div>
            <div className="text-black/55">Facturado: <span className="font-mono font-medium text-ink">{formatCurrency(d.esperado)}</span></div>
            <div className="text-estado-pagado">Cobrado: <span className="font-mono font-medium">{formatCurrency(d.recaudado)}</span></div>
            <div className="text-estado-pendiente">Pendiente: <span className="font-mono font-medium">{formatCurrency(Math.max(0, d.esperado - d.recaudado))}</span></div>
            <div className="text-black/45">Eficiencia: <span className="font-semibold">{d.eficiencia}%</span></div>
          </div>
        );
      })()}

      {/* Legend */}
      <div className="mt-1.5 flex items-center justify-center gap-4 text-etiqueta text-black/45">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-estado-pagado" /> Cobrado
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-estado-pendiente" /> Pendiente
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded bg-sidebar" /> Eficiencia
        </span>
      </div>
    </div>
  );
}

// Donut SVG con proporciones reales. r=15.915 => circunferencia ≈ 100,
// así los porcentajes se usan directo como stroke-dasharray.
function Donut({ dist }: { dist?: ResumenDashboard["distribucion"] }) {
  const pagado = dist?.pagado ?? 0;
  const pendiente = dist?.pendiente ?? 0;
  const hayDatos = pagado + pendiente > 0;

  const seg = (valor: number, offset: number, cls: string) => (
    <circle
      cx="18"
      cy="18"
      r="15.915"
      fill="none"
      className={cls}
      stroke="currentColor"
      strokeWidth="3.5"
      strokeDasharray={`${valor} ${100 - valor}`}
      strokeDashoffset={offset}
    />
  );

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e6e8ec" strokeWidth="3.5" />
        {hayDatos && (
          <>
            {seg(pagado, 0, "text-estado-pagado")}
            {seg(pendiente, -pagado, "text-estado-pendiente")}
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-lg font-semibold text-ink">{pagado}%</span>
        <span className="text-etiqueta uppercase tracking-wide text-black/40">cobrado</span>
      </div>
    </div>
  );
}
