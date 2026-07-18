import { useEffect, useState } from "react";
import { getHealth, getPaises, type Pais, type HealthResponse } from "../api/client";
import Panel from "../components/ui/Panel";

// Diagnóstico de conexión backend ↔ base de datos + verificación del seed.
export default function EstadoSistema() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [paises, setPaises] = useState<Pais[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getHealth(), getPaises()])
      .then(([h, p]) => {
        setHealth(h);
        setPaises(p);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const dbOk = health?.db === "ok";

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Estado del sistema</h1>

      {error && (
        <div className="rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-3 text-base text-estado-atrasado">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="API" value={health ? "ok" : "…"} ok={!!health} />
        <Stat label="Base de datos" value={health?.db ?? "…"} ok={dbOk} />
        <Stat label="Países cargados" value={String(paises.length)} ok={paises.length > 0} />
      </div>

      <Panel title="Países (seed inicial)">
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">ISO2</th>
              <th className="py-1.5 font-medium">Nombre</th>
              <th className="py-1.5 font-medium">EN</th>
            </tr>
          </thead>
          <tbody>
            {paises.map((p) => (
              <tr key={p.id} className="border-b-[0.5px] border-black/5">
                <td className="py-1.5 font-mono">{p.codigo_iso2}</td>
                <td className="py-1.5">{p.nombre}</td>
                <td className="py-1.5 text-black/55">{p.nombre_en}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border-[0.5px] border-black/15 bg-white p-3.5 shadow-sm">
      <div className="mb-2 text-etiqueta uppercase tracking-wide text-black/45">{label}</div>
      <span className={`font-mono text-base ${ok ? "text-estado-pagado" : "text-estado-pendiente"}`}>
        {value}
      </span>
    </div>
  );
}
