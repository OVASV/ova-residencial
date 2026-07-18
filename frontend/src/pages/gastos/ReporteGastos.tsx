import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { IconArrowLeft, IconPrinter } from "@tabler/icons-react";
import { getResumenGastos, getGastos, type ResumenGastos, type Gasto, type CategoriaGasto } from "../../api/client";
import Panel from "../../components/ui/Panel";
import MonoAmount from "../../components/ui/MonoAmount";
import { formatDate } from "../../utils/formatters";

const CAT: Record<CategoriaGasto, { label: string; color: string }> = {
  seguridad: { label: "Seguridad", color: "#E24B4A" },
  limpieza: { label: "Limpieza", color: "#EF9F27" },
  mantenimiento: { label: "Mantenimiento", color: "#4A90D9" },
  servicios: { label: "Servicios", color: "#7B5EA7" },
  administrativo: { label: "Administrativo", color: "#1D9E75" },
  planilla: { label: "Planilla", color: "#0891B2" },
  extraordinario: { label: "Extraordinario", color: "#888888" },
  ajuste: { label: "Ajuste / Saldo inicial", color: "#64748B" },
};

export default function ReporteGastos() {
  const [params] = useSearchParams();
  const periodo = params.get("periodo") || new Date().toISOString().slice(0, 7);
  const desde = params.get("desde") || undefined;
  const esAnual = !!desde;
  const [resumen, setResumen] = useState<ResumenGastos | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);

  useEffect(() => {
    Promise.all([getResumenGastos(periodo, desde), getGastos(periodo, undefined, desde)]).then(([r, g]) => {
      setResumen(r);
      setGastos(g);
    });
  }, [periodo, desde]);

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const rangoLabel = (() => {
    if (!esAnual) return `Período ${periodo}`;
    const [, mDesde] = (desde ?? "").split("-").map(Number);
    const [yHasta, mHasta] = periodo.split("-").map(Number);
    return `Acumulado ${MESES[(mDesde ?? 1) - 1]}–${MESES[(mHasta ?? 1) - 1]} ${yHasta}`;
  })();

  const k = resumen?.kpis;
  const conGasto = resumen?.categorias.filter((c) => c.ejecutado > 0) ?? [];

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .reporte-page { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
        }
        @page { size: letter; margin: 15mm 12mm; }
      `}</style>

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

    <div className="reporte-page mx-auto max-w-[900px] bg-white p-8 space-y-5">
      <div className="flex items-start justify-between border-b-2 border-[#085041] pb-4 mb-2">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-[#0C1B30]">Reporte {esAnual ? "anual" : "mensual"}: gastos vs presupuesto</h1>
          <p className="mt-0.5 text-[14px] font-semibold text-[#085041]">{resumen?.nombre_complejo ?? ""}</p>
          <p className="mt-0.5 text-[11px] text-black/40">{rangoLabel}</p>
        </div>
        {resumen?.logo_url && <img src={resumen.logo_url} alt="" className="h-12 w-12 rounded-md object-contain" />}
      </div>

      {/* Resumen por categoría */}
      <Panel title="Resumen por categoría">
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">Categoría</th>
              <th className="py-1.5 text-right font-medium">Presupuesto</th>
              <th className="py-1.5 text-right font-medium">Ejecutado</th>
              <th className="py-1.5 text-right font-medium">Saldo</th>
              <th className="py-1.5 text-right font-medium">% ejec.</th>
            </tr>
          </thead>
          <tbody>
            {(resumen?.categorias ?? []).map((c) => (
              <tr key={c.categoria} className="border-b-[0.5px] border-black/5">
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT[c.categoria].color }} />
                    {CAT[c.categoria].label}
                  </span>
                </td>
                <td className="py-2 text-right"><MonoAmount value={c.presupuestado} /></td>
                <td className="py-2 text-right"><MonoAmount value={c.ejecutado} /></td>
                <td className="py-2 text-right"><MonoAmount value={c.disponible} className={c.disponible < 0 ? "text-estado-atrasado" : ""} /></td>
                <td className="py-2 text-right font-mono">
                  <span className={c.alerta ? "font-semibold text-estado-atrasado" : "text-black/55"}>{c.pct}%</span>
                </td>
              </tr>
            ))}
            {k && (
              <tr className="border-t-[0.5px] border-black/20 font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right"><MonoAmount value={k.total_presupuesto} /></td>
                <td className="py-2 text-right"><MonoAmount value={k.total_gastado} /></td>
                <td className="py-2 text-right"><MonoAmount value={k.disponible} className={k.disponible < 0 ? "text-estado-atrasado" : "text-estado-pagado"} /></td>
                <td className="py-2 text-right font-mono">
                  {k.total_presupuesto > 0 ? Math.round((k.total_gastado / k.total_presupuesto) * 100) : 0}%
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      {/* Detalle por categoría */}
      {conGasto.length === 0 ? (
        <Panel title="Detalle">
          <div className="py-8 text-center text-base text-black/40">Sin gastos registrados en el período.</div>
        </Panel>
      ) : (
        conGasto.map((c) => {
          const items = gastos.filter((g) => g.categoria === c.categoria);
          return (
            <Panel
              key={c.categoria}
              title={`${CAT[c.categoria].label} · ${items.length} gasto(s)`}
              action={<MonoAmount value={c.ejecutado} className="font-semibold" />}
            >
              <table className="w-full text-tabla">
                <thead>
                  <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                    <th className="py-1.5 font-medium">Fecha</th>
                    <th className="py-1.5 font-medium">Descripción</th>
                    <th className="py-1.5 font-medium">Proveedor</th>
                    <th className="py-1.5 font-medium">No. factura</th>
                    <th className="py-1.5 font-medium">Método</th>
                    <th className="py-1.5 text-right font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((g) => (
                    <tr key={g.id} className="border-b-[0.5px] border-black/5">
                      <td className="py-2 font-mono">{formatDate(g.fecha)}</td>
                      <td className="py-2">{g.descripcion}</td>
                      <td className="py-2 text-black/60">{g.proveedor ?? "—"}</td>
                      <td className="py-2 font-mono text-black/55">{g.no_factura ?? "—"}</td>
                      <td className="py-2 capitalize text-black/60">{g.metodo ?? "—"}</td>
                      <td className="py-2 text-right"><MonoAmount value={Number(g.monto)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          );
        })
      )}
    </div>
    </>
  );
}
