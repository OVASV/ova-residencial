import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { IconArrowLeft, IconPrinter } from "@tabler/icons-react";
import { getLibroCaja, type LibroCaja as LibroCajaData } from "../api/client";
import MonoAmount from "../components/ui/MonoAmount";
import { formatDate } from "../utils/formatters";

const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function periodoLargo(p: string) {
  const [y, m] = p.split("-").map(Number);
  return `${MESES_L[(m ?? 1) - 1]} ${y}`;
}
const hoy = () => new Date().toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" });

export default function LibroCajaPDF() {
  const [params] = useSearchParams();
  const periodo = params.get("periodo") || new Date().toISOString().slice(0, 7);
  const [data, setData] = useState<LibroCajaData | null>(null);

  useEffect(() => {
    getLibroCaja(periodo).then(setData).catch(() => setData(null));
  }, [periodo]);

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .libro-page { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
        }
        @page { size: letter; margin: 14mm 12mm; }
      `}</style>

      <div className="no-print sticky top-0 z-50 flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <button onClick={() => window.close()} className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">
          <IconArrowLeft size={16} /> Cerrar
        </button>
        <div className="flex-1" />
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-md bg-[#085041] px-4 py-2 text-sm font-medium text-white hover:bg-[#063d32]">
          <IconPrinter size={16} /> Imprimir / Guardar PDF
        </button>
      </div>

      <div className="libro-page mx-auto max-w-[900px] bg-white p-8 text-[11px] text-gray-800">
        {/* Encabezado con logo */}
        <div className="mb-5 flex items-start justify-between border-b-2 border-[#085041] pb-4">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-[#0C1B30]">Libro de caja</h1>
            <p className="mt-0.5 text-[14px] font-semibold text-[#085041]">{data?.nombre_complejo ?? ""}</p>
            <p className="mt-0.5 text-[11px] capitalize text-black/50">{periodoLargo(periodo)}</p>
            <p className="mt-0.5 text-[9px] text-black/35">Generado el {hoy()}</p>
          </div>
          {data?.logo_url && <img src={data.logo_url} alt="" className="h-14 w-14 rounded-md object-contain" />}
        </div>

        {/* Resumen */}
        {data && (
          <div className="mb-4 grid grid-cols-4 gap-3">
            <Resumen label="Saldo inicial" value={data.saldo_inicial} />
            <Resumen label="Ingresos" value={data.total_ingresos} color="#1D9E75" />
            <Resumen label="Egresos" value={data.total_egresos} color="#E24B4A" />
            <Resumen label="Saldo final" value={data.saldo_final} strong />
          </div>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-[#085041]/20 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400">
              <th className="py-1.5">Fecha</th>
              <th className="py-1.5">Descripción</th>
              <th className="py-1.5 text-right">Ingreso</th>
              <th className="py-1.5 text-right">Egreso</th>
              <th className="py-1.5 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100 bg-gray-50">
              <td className="py-1.5 text-gray-400">—</td>
              <td className="py-1.5 font-medium text-gray-600">Saldo inicial</td>
              <td className="py-1.5"></td>
              <td className="py-1.5"></td>
              <td className="py-1.5 text-right font-semibold"><MonoAmount value={data?.saldo_inicial ?? 0} /></td>
            </tr>
            {(data?.movimientos ?? []).map((m, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1.5 font-mono text-gray-600">{formatDate(m.fecha)}</td>
                <td className="py-1.5">
                  {m.descripcion}
                  {m.detalle && <span className="text-gray-400"> · {m.detalle}</span>}
                </td>
                <td className="py-1.5 text-right">{m.ingreso > 0 ? <MonoAmount value={m.ingreso} className="text-[#1D9E75]" /> : ""}</td>
                <td className="py-1.5 text-right">{m.egreso > 0 ? <MonoAmount value={m.egreso} className="text-[#E24B4A]" /> : ""}</td>
                <td className="py-1.5 text-right"><MonoAmount value={m.saldo} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#085041]/30 font-semibold">
              <td className="py-2" colSpan={2}>Saldo final del mes</td>
              <td className="py-2 text-right text-[#1D9E75]"><MonoAmount value={data?.total_ingresos ?? 0} /></td>
              <td className="py-2 text-right text-[#E24B4A]"><MonoAmount value={data?.total_egresos ?? 0} /></td>
              <td className="py-2 text-right"><MonoAmount value={data?.saldo_final ?? 0} /></td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-8 border-t border-gray-200 pt-3 text-center text-[9px] text-gray-400">
          Documento generado electrónicamente por el sistema de administración.
        </p>
      </div>
    </>
  );
}

function Resumen({ label, value, color, strong }: { label: string; value: number; color?: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border p-2.5 ${strong ? "border-[#085041]/40" : "border-gray-200"}`}>
      <div className="text-[8px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <span style={color ? { color } : undefined}>
        <MonoAmount value={value} className={`text-[13px] font-semibold ${strong ? "text-[#0C1B30]" : ""}`} />
      </span>
    </div>
  );
}
