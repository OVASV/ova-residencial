import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { IconPrinter, IconArrowLeft } from "@tabler/icons-react";
import { getRecibosByIds, type ReciboItem } from "../../api/client";
import { formatDate, formatCurrency } from "../../utils/formatters";

const hoy = () => new Date().toLocaleDateString("es-GT", { year: "numeric", month: "long", day: "numeric" });
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-SV", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

export default function ReciboPDF() {
  const [params] = useSearchParams();
  const ids = params.get("ids")?.split(",") ?? [];
  const [recibos, setRecibos] = useState<ReciboItem[]>([]);
  const [nombreComplejo, setNombreComplejo] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return; }
    getRecibosByIds(ids)
      .then((res) => {
        setRecibos(res.recibos);
        setNombreComplejo(res.nombre_complejo);
        setLogoUrl(res.logo_url);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-400">Cargando recibo…</div>;
  if (recibos.length === 0) return <div className="p-8 text-red-600">Recibo no encontrado</div>;

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .recibo-page { break-after: page; padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          .recibo-page:last-child { break-after: auto; }
        }
        @page { size: letter; margin: 15mm 12mm; }
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

      {recibos.map((r) => (
        <div key={r.id} className="recibo-page mx-auto max-w-[800px] bg-white p-8 font-[Inter,sans-serif] text-[11px] leading-[1.45] text-gray-800">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between border-b-2 border-[#085041] pb-4">
            <div>
              <h1 className="text-[20px] font-bold tracking-tight text-[#0C1B30]">Recibo de Pago</h1>
              <p className="mt-0.5 text-[11px] text-gray-500">Fecha de emisión: {hoy()}</p>
              <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">No. de recibo</div>
              <div className="font-mono text-[13px] font-semibold text-[#085041]">REC-{r.id.slice(0, 8).toUpperCase()}</div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div className="text-[14px] font-semibold text-[#085041]">{nombreComplejo ?? "Residencial"}</div>
              {logoUrl && <img src={logoUrl} alt="" className="h-12 w-12 rounded-md object-contain" />}
            </div>
          </div>

          {/* Datos del propietario */}
          <div className="mb-5 grid grid-cols-2 gap-x-8 gap-y-2 rounded-md border border-gray-200 bg-gray-50 p-4">
            <div>
              <Label>Propietario</Label>
              <Value>{r.propietario ?? "—"}</Value>
            </div>
            <div>
              <Label>Unidad</Label>
              <Value>#{r.numero_propiedad ?? "—"}</Value>
            </div>
            <div>
              <Label>Calle</Label>
              <Value>{r.calle ?? "—"}</Value>
            </div>
            <div>
              <Label>Bloque</Label>
              <Value>{r.bloque ?? "—"}</Value>
            </div>
          </div>

          {/* Cuota asignada */}
          {r.cuota_asignada && (
            <div className="mb-5 rounded-md border border-[#085041]/20 bg-[#085041]/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Cuota asignada</Label>
                  <div className="text-[12px] font-medium text-gray-800">
                    {r.cuota_asignada.concepto}
                    {r.cuota_asignada.tipo_propiedad && (
                      <span className="ml-2 rounded bg-[#085041]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#085041]">
                        {r.cuota_asignada.tipo_propiedad}
                      </span>
                    )}
                  </div>
                </div>
                <div className="font-mono text-[14px] font-semibold text-[#085041]">
                  {formatCurrency(Number(r.cuota_asignada.monto))} / mes
                </div>
              </div>
            </div>
          )}

          {/* Detalle del pago */}
          <div className="mb-5 rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-3 gap-x-6 gap-y-2">
              <div>
                <Label>Fecha de pago</Label>
                <Value>{formatDate(r.fecha_pago)}</Value>
              </div>
              <div>
                <Label>Método</Label>
                <Value className="capitalize">{r.metodo}</Value>
              </div>
              <div>
                <Label>Banco origen</Label>
                <Value>{r.banco_origen ?? "—"}</Value>
              </div>
            </div>
            {r.referencia_banco && (
              <div className="mt-2">
                <Label>Referencia bancaria</Label>
                <Value className="font-mono">{r.referencia_banco}</Value>
              </div>
            )}
          </div>

          {/* Justificación de traslado */}
          {r.justificacion_traslado && (
            <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <Label>Justificación (traslado especial)</Label>
              <div className="text-[12px] text-gray-700 mt-0.5">{r.justificacion_traslado}</div>
            </div>
          )}

          {/* Conceptos aplicados */}
          <table className="mb-5 w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-[#085041]/20 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="py-2">Concepto</th>
                <th className="py-2">Tipo</th>
                <th className="py-2 text-right">Cuota asignada</th>
                <th className="py-2 text-right">Monto aplicado</th>
              </tr>
            </thead>
            <tbody>
              {/* Un solo renglón: el pago tal cual. */}
              <tr className="border-b border-gray-100">
                <td className="py-2 text-[11px]">{r.descripcion ?? r.cuota_asignada?.concepto ?? "Cuota de mantenimiento"}</td>
                <td className="py-2 text-[11px] capitalize">{r.tipo ?? r.cuota_asignada?.tipo_propiedad ?? "—"}</td>
                <td className="py-2 text-right font-mono text-[11px] text-gray-500">{formatCurrency(Number(r.cuota_asignada?.monto ?? r.monto_total))}</td>
                <td className="py-2 text-right font-mono text-[11px] font-medium">{formatCurrency(Number(r.monto_total))}</td>
              </tr>
            </tbody>
          </table>

          {/* Total */}
          <div className="flex items-center justify-end gap-4 rounded-md border-2 border-[#085041] bg-[#085041]/5 px-6 py-3">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-[#085041]">Total pagado</span>
            <span className="font-mono text-[18px] font-bold text-[#085041]">{formatCurrency(Number(r.monto_total))}</span>
          </div>

          {/* Saldo a la fecha */}
          <div className="mt-2 text-right text-[9px] leading-[1.4] text-gray-400">
            <div>
              Saldo a la fecha ({fechaHora(r.saldo_fecha)}):{" "}
              <span className="font-mono font-medium">{formatCurrency(Number(r.saldo_actual))}</span>
            </div>
            <div className="text-[8px] text-gray-300">
              Este saldo puede variar según la actualización de abonos registrados por la administración.
            </div>
          </div>

          <div className="mt-8 border-t border-gray-200 pt-3 text-center text-[9px] text-gray-400">
            Este recibo fue generado electrónicamente y no requiere firma ni sello.
          </div>
        </div>
      ))}
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{children}</div>;
}

function Value({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[12px] font-medium text-gray-800 ${className}`}>{children}</div>;
}
