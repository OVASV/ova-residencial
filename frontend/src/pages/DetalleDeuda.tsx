import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { IconArrowLeft, IconFileInvoice } from "@tabler/icons-react";
import Panel from "../components/ui/Panel";
import MonoAmount from "../components/ui/MonoAmount";
import {
  getSegmentacionDeuda,
  type SegmentacionDeuda,
  type RangoDeuda,
} from "../api/client";

const RANGO_LABELS: Record<RangoDeuda, string> = {
  mayor_1000: "Más de $1,000",
  "500_1000": "$500 – $1,000",
  "100_500": "$100 – $500",
  menor_100: "Menos de $100",
  a_favor: "Saldo a favor",
};

export default function DetalleDeuda() {
  const [params] = useSearchParams();
  const rango = (params.get("rango") as RangoDeuda) || "mayor_1000";
  const [data, setData] = useState<SegmentacionDeuda | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSegmentacionDeuda().then(setData).catch((e) => setError(String(e)));
  }, []);

  const propiedades = data?.propiedades.filter((p) => p.rango === rango) ?? [];
  const rangoInfo = data?.rangos.find((r) => r.key === rango);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="rounded-md p-1.5 hover:bg-black/5">
          <IconArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Detalle de deuda</h1>
          <p className="text-base text-black/50">
            {RANGO_LABELS[rango]} — {rangoInfo ? `${rangoInfo.cantidad} propiedades` : "cargando…"}
            {rangoInfo ? <> · Total: <MonoAmount value={rangoInfo.total} className="font-semibold" /></> : null}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-3 text-base text-estado-atrasado">
          {error}
        </div>
      )}

      <Panel>
        {propiedades.length === 0 && !error ? (
          <p className="py-6 text-center text-base text-black/40">
            {data ? "No hay propiedades en este rango" : "Cargando…"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-tabla">
              <thead>
                <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                  <th className="py-1.5 font-medium">Propiedad</th>
                  <th className="py-1.5 font-medium">Propietario</th>
                  <th className="py-1.5 font-medium">Bloque</th>
                  <th className="py-1.5 font-medium">Calle</th>
                  <th className="py-1.5 font-medium">Categoría</th>
                  <th className="py-1.5 font-medium">Teléfono</th>
                  <th className="py-1.5 text-right font-medium">Saldo</th>
                  <th className="py-1.5 text-center font-medium">Estado de cuenta</th>
                </tr>
              </thead>
              <tbody>
                {propiedades.map((p) => (
                  <tr key={p.id} className="border-b-[0.5px] border-black/5">
                    <td className="py-2 font-mono font-medium">{p.numero_propiedad ?? p.id}</td>
                    <td className="py-2">{p.propietario ?? <span className="text-black/35">—</span>}</td>
                    <td className="py-2">{p.bloque ?? "—"}</td>
                    <td className="py-2">{p.calle ?? "—"}</td>
                    <td className="py-2">{p.categoria ?? "—"}</td>
                    <td className="py-2">{p.telefono ?? "—"}</td>
                    <td className="py-2 text-right">
                      <MonoAmount value={p.saldo} className="font-semibold text-estado-atrasado" />
                    </td>
                    <td className="py-2 text-center">
                      <a
                        href={`/pagos/estado-cuenta/${encodeURIComponent(p.id)}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-sidebar-accent/10 px-2 py-0.5 text-etiqueta font-medium text-sidebar-accent hover:bg-sidebar-accent/20"
                      >
                        <IconFileInvoice size={14} /> Estado de cuenta
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
