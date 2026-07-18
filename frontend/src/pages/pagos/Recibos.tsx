import { useEffect, useMemo, useState } from "react";
import { IconPrinter, IconSearch, IconFilter } from "@tabler/icons-react";
import { getRecibos, type ReciboItem } from "../../api/client";
import Panel from "../../components/ui/Panel";
import MonoAmount from "../../components/ui/MonoAmount";
import { formatDate } from "../../utils/formatters";
import { inputCls } from "../../components/ui/form";

const MESES = [
  { v: "1", l: "Enero" }, { v: "2", l: "Febrero" }, { v: "3", l: "Marzo" },
  { v: "4", l: "Abril" }, { v: "5", l: "Mayo" }, { v: "6", l: "Junio" },
  { v: "7", l: "Julio" }, { v: "8", l: "Agosto" }, { v: "9", l: "Septiembre" },
  { v: "10", l: "Octubre" }, { v: "11", l: "Noviembre" }, { v: "12", l: "Diciembre" },
];

const HOY = new Date();

export default function Recibos() {
  const [recibos, setRecibos] = useState<ReciboItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fAnio, setFAnio] = useState("");
  const [fMes, setFMes] = useState("");
  const [fMetodo, setFMetodo] = useState("");
  const [ready, setReady] = useState(false);

  // Mount: el backend elige el último mes con pagos y lo devuelve; ajustamos los selectores.
  useEffect(() => {
    getRecibos()
      .then((r) => {
        setRecibos(r.recibos);
        if (r.periodo) {
          setFAnio(String(r.periodo.anio));
          if (r.periodo.mes) setFMes(String(r.periodo.mes));
        }
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setReady(true); });
  }, []);

  // Recarga server-side al cambiar año/mes (después del mount).
  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    getRecibos(fAnio || undefined, fMes || undefined)
      .then((r) => setRecibos(r.recibos))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fAnio, fMes, ready]);

  const anios = useMemo(() => {
    const arr: number[] = [];
    for (let y = HOY.getFullYear(); y >= 2022; y--) arr.push(y);
    return arr;
  }, []);

  const metodos = useMemo(() => {
    const set = new Set(recibos.map((r) => r.metodo));
    return [...set].sort();
  }, [recibos]);

  const filtrados = useMemo(() => {
    // El filtro de año/mes lo hace el backend; aquí solo método y búsqueda.
    return recibos.filter((r) => {
      if (fMetodo && r.metodo !== fMetodo) return false;
      if (q.trim()) {
        const s = q.toLowerCase();
        if (
          !(r.propietario?.toLowerCase().includes(s)) &&
          !(r.numero_propiedad?.toLowerCase().includes(s)) &&
          !(r.referencia_banco?.toLowerCase().includes(s)) &&
          !(r.conceptos?.toLowerCase().includes(s))
        ) return false;
      }
      return true;
    });
  }, [recibos, fMetodo, q]);

  const hayFiltros = !!(fAnio || fMes || fMetodo || q);

  function imprimirRecibo(id: string) {
    window.open(`/pagos/recibo/pdf?ids=${id}`, "_blank");
  }

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Recibos de pago</h1>
        <p className="text-base text-black/50">Historial de pagos realizados</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <IconFilter size={16} className="mb-2 text-black/30" />
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Año</label>
          <select value={fAnio} onChange={(e) => setFAnio(e.target.value)} className={`${inputCls} w-24`}>
            <option value="">Todos</option>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Mes</label>
          <select value={fMes} onChange={(e) => setFMes(e.target.value)} className={`${inputCls} w-32`}>
            <option value="">Todos</option>
            {MESES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Método</label>
          <select value={fMetodo} onChange={(e) => setFMetodo(e.target.value)} className={`${inputCls} w-32`}>
            <option value="">Todos</option>
            {metodos.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
          </select>
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <label className="mb-0.5 block text-etiqueta text-black/40">Buscar</label>
          <IconSearch size={14} className="absolute left-2.5 bottom-2.5 text-black/30" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Propietario, unidad, referencia…" className={`${inputCls} pl-8`} />
        </div>
        {hayFiltros && (
          <button
            onClick={() => { setFAnio(""); setFMes(""); setFMetodo(""); setQ(""); }}
            className="mb-0.5 rounded-md px-2 py-1.5 text-etiqueta text-black/50 hover:bg-black/5"
          >
            Limpiar
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-lg border-[0.5px] border-black/10 bg-white p-8 text-center text-black/40">
          {hayFiltros ? "No hay recibos con los filtros seleccionados" : "No hay recibos de pago"}
        </div>
      ) : (
        <Panel title={`Recibos (${filtrados.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-tabla">
              <thead>
                <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                  <th className="py-1.5 font-medium">Fecha</th>
                  <th className="py-1.5 font-medium">Unidad</th>
                  <th className="py-1.5 font-medium">Propietario</th>
                  <th className="py-1.5 font-medium">Método</th>
                  <th className="py-1.5 font-medium">Referencia</th>
                  <th className="py-1.5 font-medium">Conceptos</th>
                  <th className="py-1.5 text-right font-medium">Monto</th>
                  <th className="py-1.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => (
                  <tr key={r.id} className="border-b-[0.5px] border-black/5 hover:bg-black/[0.02]">
                    <td className="py-2 font-mono">{formatDate(r.fecha_pago)}</td>
                    <td className="py-2 font-mono">#{r.numero_propiedad ?? "—"}</td>
                    <td className="py-2">{r.propietario ?? <span className="text-black/30">—</span>}</td>
                    <td className="py-2 capitalize">{r.metodo}</td>
                    <td className="py-2 font-mono text-black/60">{r.referencia_banco ?? "—"}</td>
                    <td className="py-2 text-black/60 max-w-[200px] truncate">{r.conceptos || "—"}</td>
                    <td className="py-2 text-right"><MonoAmount value={Number(r.monto_total)} /></td>
                    <td className="py-2">
                      <button
                        onClick={() => imprimirRecibo(r.id)}
                        title="Imprimir recibo"
                        className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-[#085041]"
                      >
                        <IconPrinter size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
