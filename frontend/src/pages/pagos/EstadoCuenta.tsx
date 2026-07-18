import { useEffect, useState, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { IconArrowLeft, IconReceipt2, IconCashBanknote, IconPrinter } from "@tabler/icons-react";
import { getEstadoCuenta, type EstadoCuenta as EstadoCuentaData, type Cargo, type Pago } from "../../api/client";
import Panel from "../../components/ui/Panel";
import MonoAmount from "../../components/ui/MonoAmount";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate, formatCurrency, initials } from "../../utils/formatters";

export default function EstadoCuenta() {
  const { idUnidad } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<EstadoCuentaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"kardex" | "detalle">("kardex");

  useEffect(() => {
    if (!idUnidad) return;
    getEstadoCuenta(idUnidad).then(setData).catch((e) => setError(String(e)));
  }, [idUnidad]);

  if (error) return <div className="text-base text-estado-atrasado">{error}</div>;
  if (!data) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  const { unidad, kpis, cargos, pagos } = data;
  const prop = unidad.propietario_actual;
  const kardex = construirKardex(cargos, pagos);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-base text-black/45 hover:text-ink"
        >
          <IconArrowLeft size={15} /> Volver
        </button>
        <a
          href={`/pagos/estado-cuenta/${encodeURIComponent(idUnidad!)}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md bg-[#085041] px-3 py-1.5 text-base font-medium text-white hover:bg-[#063d32]"
        >
          <IconPrinter size={16} /> Imprimir estado de cuenta
        </a>
      </div>

      {/* Header del residente */}
      <div className="flex items-center gap-4 rounded-lg border-[0.5px] border-black/15 bg-white p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sidebar-accent text-base font-semibold text-white">
          {initials(prop ? `${prop.nombre} ${prop.apellido}` : unidad.id)}
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold">
            {prop ? `${prop.nombre} ${prop.apellido}` : "Sin propietario"}
          </div>
          <div className="text-base text-black/55">
            Unidad <span className="font-mono">{unidad.id}</span> · Bloque {unidad.bloque}
            {unidad.area_m2 ? ` · ${unidad.area_m2} m²` : ""}
            {prop ? ` · ${prop.email ?? ""}${prop.telefono ? ` · ${prop.telefono}` : ""}` : ""}
          </div>
        </div>
        {unidad.estado_actual && (
          <span className="rounded-full bg-sidebar-accent/10 px-2.5 py-1 text-etiqueta font-medium uppercase text-sidebar-accent">
            {unidad.estado_actual.nombre}
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiBox label="Saldo pendiente" value={kpis.saldo_pendiente} tone="text-estado-pendiente" />
        <KpiBox label="Crédito a favor" value={kpis.credito_a_favor} tone="text-emerald-600" />
        <KpiBox label="Pagado en el año" value={kpis.total_pagado_anio} tone="text-estado-pagado" />
        <KpiBox label="Total histórico" value={kpis.total_historico} />
        <div className="rounded-lg border-[0.5px] border-black/15 bg-white p-3.5">
          <div className="mb-1 text-etiqueta uppercase tracking-wide text-black/45">Último pago</div>
          <div className="font-mono text-base">{kpis.ultimo_pago ? formatDate(kpis.ultimo_pago) : "—"}</div>
        </div>
      </div>

      {/* Pestañas: Kardex mensual | Detalle */}
      <div className="flex gap-1 border-b-[0.5px] border-black/15">
        <button
          onClick={() => setTab("kardex")}
          className={`-mb-[0.5px] border-b-2 px-3 py-2 text-base transition-colors ${tab === "kardex" ? "border-sidebar-accent font-medium text-ink" : "border-transparent text-black/45 hover:text-ink"}`}
        >
          Kardex mensual
        </button>
        <button
          onClick={() => setTab("detalle")}
          className={`-mb-[0.5px] border-b-2 px-3 py-2 text-base transition-colors ${tab === "detalle" ? "border-sidebar-accent font-medium text-ink" : "border-transparent text-black/45 hover:text-ink"}`}
        >
          Detalle
        </button>
      </div>

      {tab === "kardex" ? (
        <KardexPanel meses={kardex} />
      ) : (
        <>
      {/* Cargos pendientes */}
      <Panel title="Cargos">
        {cargos.length === 0 ? (
          <EmptyState icon={<IconReceipt2 size={26} stroke={1.5} />} title="Sin cargos pendientes" />
        ) : (
          <table className="w-full text-tabla">
            <thead>
              <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                <th className="py-1.5 font-medium">Período</th>
                <th className="py-1.5 font-medium">Concepto</th>
                <th className="py-1.5 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {cargos.map((c) => (
                <tr key={c.id} className="border-b-[0.5px] border-black/5">
                  <td className="py-2 font-mono">{String(c.periodo_mes).slice(0, 7)}</td>
                  <td className="py-2">{c.concepto}</td>
                  <td className="py-2 text-right"><MonoAmount value={Number(c.monto)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* Pagos */}
      <Panel title="Historial de pagos">
        {pagos.length === 0 ? (
          <EmptyState icon={<IconCashBanknote size={26} stroke={1.5} />} title="Sin pagos registrados" />
        ) : (
          <table className="w-full text-tabla">
            <thead>
              <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                <th className="py-1.5 font-medium">Fecha</th>
                <th className="py-1.5 font-medium">Método</th>
                <th className="py-1.5 font-medium">Banco</th>
                <th className="py-1.5 font-medium">Referencia</th>
                <th className="py-1.5 font-medium">Conceptos</th>
                <th className="py-1.5 text-right font-medium">Monto</th>
                <th className="py-1.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id} className="border-b-[0.5px] border-black/5">
                  <td className="py-2 font-mono">{formatDate(p.fecha_pago)}</td>
                  <td className="py-2 capitalize">{p.metodo}</td>
                  <td className="py-2 text-black/60">{p.banco_origen ?? "—"}</td>
                  <td className="py-2 font-mono text-black/60">{p.referencia_banco ?? "—"}</td>
                  <td className="py-2 text-black/60">
                    {p.pago_cargos?.map((pc) => pc.cargos.concepto).join(", ") ?? "—"}
                  </td>
                  <td className="py-2 text-right"><MonoAmount value={Number(p.monto_total)} /></td>
                  <td className="py-2">
                    <a
                      href={`/pagos/recibo/pdf?ids=${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Imprimir recibo"
                      className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-[#085041] inline-flex"
                    >
                      <IconPrinter size={15} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* Totales */}
      {(() => {
        const totalCargos = cargos.reduce((s, c) => s + Number(c.monto), 0);
        const totalPagos = pagos.reduce((s, p) => s + Number(p.monto_total), 0);
        return (
          <div className="flex items-center justify-end gap-6 rounded-lg border-[0.5px] border-black/15 bg-white px-5 py-3">
            <div className="text-right">
              <div className="text-etiqueta uppercase tracking-wide text-black/45">Total cargos</div>
              <MonoAmount value={totalCargos} className="text-base font-semibold" />
            </div>
            <div className="text-right">
              <div className="text-etiqueta uppercase tracking-wide text-black/45">Total pagos</div>
              <MonoAmount value={totalPagos} className="text-base font-semibold text-estado-pagado" />
            </div>
            <div className="text-right">
              <div className="text-etiqueta uppercase tracking-wide text-black/45">Saldo</div>
              <MonoAmount value={totalCargos - totalPagos} className="text-base font-semibold text-estado-pendiente" />
            </div>
          </div>
        );
      })()}
        </>
      )}
    </div>
  );
}

// Construye el kardex mensual: por cada mes, saldo inicial + cargos - abonos = saldo final,
// arrastrando el saldo de un mes al siguiente. Cada cargo se ubica en su periodo_mes y cada
// abono (pago) en su fecha_pago.
interface MovK { fecha: string; concepto: string; cargo: number; abono: number; saldo: number }
interface MesKardex { periodo: string; saldo_inicial: number; cargos: number; abonos: number; saldo_final: number; movimientos: MovK[] }

const r2 = (n: number) => Math.round(n * 100) / 100;

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
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.cargo ? -1 : 1) - (b.cargo ? -1 : 1))
      .map((m) => {
        saldo = r2(saldo + m.cargo - m.abono);
        return { ...m, saldo };
      });
    return { periodo: k, saldo_inicial, cargos: g.cargos, abonos: g.abonos, saldo_final: r2(saldo), movimientos: movs };
  });
}

function nombreMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function KardexPanel({ meses }: { meses: MesKardex[] }) {
  const saldoActual = meses.length ? meses[meses.length - 1].saldo_final : 0;
  return (
    <Panel title="Estado de cuenta mensual (kardex)">
      {meses.length === 0 ? (
        <EmptyState icon={<IconReceipt2 size={26} stroke={1.5} />} title="Sin movimientos" />
      ) : (
        <>
          <table className="w-full text-tabla">
            <thead>
              <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                <th className="py-1.5 font-medium">Fecha</th>
                <th className="py-1.5 font-medium">Concepto</th>
                <th className="py-1.5 text-right font-medium">Cargo</th>
                <th className="py-1.5 text-right font-medium">Abono</th>
                <th className="py-1.5 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <Fragment key={m.periodo}>
                  <tr className="bg-surface">
                    <td colSpan={4} className="py-1.5 font-medium">{nombreMes(m.periodo)}</td>
                    <td className="py-1.5 text-right text-etiqueta uppercase tracking-wide text-black/45">
                      inicial {formatCurrency(m.saldo_inicial)}
                    </td>
                  </tr>
                  {m.movimientos.map((mv, i) => (
                    <tr key={i} className="border-b-[0.5px] border-black/5">
                      <td className="py-2 font-mono">{formatDate(mv.fecha)}</td>
                      <td className="py-2">{mv.concepto}</td>
                      <td className="py-2 text-right">{mv.cargo ? <MonoAmount value={mv.cargo} /> : "—"}</td>
                      <td className="py-2 text-right text-estado-pagado">{mv.abono ? <MonoAmount value={mv.abono} /> : "—"}</td>
                      <td className="py-2 text-right font-mono font-medium">{formatCurrency(mv.saldo)}</td>
                    </tr>
                  ))}
                  <tr className="border-b-[0.5px] border-black/15">
                    <td colSpan={2} className="py-1.5 text-right text-etiqueta uppercase tracking-wide text-black/45">
                      Total {nombreMes(m.periodo)}
                    </td>
                    <td className="py-1.5 text-right font-mono font-medium">{formatCurrency(m.cargos)}</td>
                    <td className="py-1.5 text-right font-mono font-medium text-estado-pagado">{formatCurrency(m.abonos)}</td>
                    <td className="py-1.5 text-right font-mono font-semibold">{formatCurrency(m.saldo_final)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-end gap-2 border-t-[0.5px] border-black/10 pt-3">
            <span className="text-base text-black/55">Saldo a la fecha</span>
            <MonoAmount value={saldoActual} className="text-lg font-semibold text-estado-pendiente" />
          </div>
        </>
      )}
    </Panel>
  );
}

function KpiBox({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border-[0.5px] border-black/15 bg-white p-3.5">
      <div className="mb-1 text-etiqueta uppercase tracking-wide text-black/45">{label}</div>
      <MonoAmount value={value} className={`text-lg font-semibold ${tone}`} />
    </div>
  );
}
