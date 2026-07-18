import { useEffect, useState, useMemo, Fragment } from "react";
import {
  getTraslados,
  getUnidadesDestino,
  trasladarPago,
  type PagoX01,
  type TrasladoHistorial,
  type UnidadDestino,
} from "../../api/client";
import {
  IconArrowRight,
  IconSearch,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import Panel from "../../components/ui/Panel";
import Modal from "../../components/ui/Modal";
import MonoAmount from "../../components/ui/MonoAmount";
import { formatDate } from "../../utils/formatters";

export default function TrasladosX01() {
  const [pendientes, setPendientes] = useState<PagoX01[]>([]);
  const [historial, setHistorial] = useState<TrasladoHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal
  const [modal, setModal] = useState<PagoX01 | null>(null);
  const [unidades, setUnidades] = useState<UnidadDestino[]>([]);
  const [destino, setDestino] = useState("");
  const [busqDest, setBusqDest] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [montoTrasladar, setMontoTrasladar] = useState("");
  const [fechaTraslado, setFechaTraslado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msgOk, setMsgOk] = useState("");

  const [tab, setTab] = useState<"pendientes" | "historial">("pendientes");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const cargar = async () => {
    setLoading(true);
    try {
      const data = await getTraslados();
      setPendientes(data.pendientes);
      setHistorial(data.historial);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const abrirModal = async (pago: PagoX01) => {
    setModal(pago);
    setDestino("");
    setBusqDest("");
    setJustificacion("");
    setMontoTrasladar(String(pago.monto_total));
    setFechaTraslado(new Date().toISOString().slice(0, 10));
    setMsgOk("");
    try {
      const u = await getUnidadesDestino();
      setUnidades(u);
    } catch {}
  };

  const seleccionarDestino = (id: string) => {
    setDestino(id);
  };

  const enviar = async () => {
    if (!modal || !destino || !justificacion.trim()) return;
    const monto = parseFloat(montoTrasladar);
    if (!monto || monto <= 0 || monto > Number(modal.monto_total)) return;
    setEnviando(true);
    setError("");
    try {
      await trasladarPago({
        id_pago: modal.id,
        id_unidad_destino: destino,
        justificacion: justificacion.trim(),
        monto_trasladar: monto,
        fecha_traslado: fechaTraslado,
      });
      setModal(null);
      setMsgOk("Pago trasladado exitosamente");
      setTimeout(() => setMsgOk(""), 3000);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const unidadesFiltradas = useMemo(() => {
    if (!busqDest) return unidades;
    const q = busqDest.toLowerCase();
    return unidades.filter(
      (u) =>
        (u.numero_propiedad ?? u.id).toLowerCase().includes(q) ||
        (u.propietario ?? "").toLowerCase().includes(q)
    );
  }, [unidades, busqDest]);

  const destInfo = unidades.find((u) => u.id === destino);

  if (loading) return <div className="flex items-center justify-center h-64 text-black/40">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Depósitos especiales</h1>
        <div className="flex gap-1 border-b-[0.5px] border-black/15">
          <TabBtn active={tab === "pendientes"} onClick={() => setTab("pendientes")}>
            Pendientes ({pendientes.length})
          </TabBtn>
          <TabBtn active={tab === "historial"} onClick={() => setTab("historial")}>
            Historial ({historial.length})
          </TabBtn>
        </div>
      </div>

      {msgOk && (
        <div className="flex items-center gap-2 rounded-lg bg-estado-pagado/10 border-[0.5px] border-estado-pagado/30 px-4 py-2 text-sm text-estado-pagado">
          <IconCheck size={16} /> {msgOk}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-estado-atrasado/10 border-[0.5px] border-estado-atrasado/30 px-4 py-2 text-sm text-estado-atrasado">
          <IconAlertTriangle size={16} /> {error}
          <button onClick={() => setError("")} className="ml-auto"><IconX size={14} /></button>
        </div>
      )}

      {tab === "pendientes" && (
        pendientes.length === 0 ? (
          <Panel><p className="py-6 text-center text-black/40">No hay depósitos pendientes de asignación</p></Panel>
        ) : (
          <Panel>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-[0.5px] border-black/10 text-left text-etiqueta uppercase tracking-wider text-black/45">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Monto</th>
                  <th className="px-3 py-2">Método</th>
                  <th className="px-3 py-2">Referencia</th>
                  <th className="px-3 py-2">Banco</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => {
                  const isOpen = expanded.has(p.id);
                  const hasTrs = p.traslados && p.traslados.length > 0;
                  return (
                    <Fragment key={p.id}>
                      <tr
                        className={`border-b-[0.5px] border-black/5 last:border-0 ${hasTrs ? "cursor-pointer hover:bg-black/[0.015]" : ""}`}
                        onClick={() => {
                          if (!hasTrs) return;
                          setExpanded((prev) => {
                            const s = new Set(prev);
                            s.has(p.id) ? s.delete(p.id) : s.add(p.id);
                            return s;
                          });
                        }}
                      >
                        <td className="px-3 py-2.5 flex items-center gap-1.5">
                          {hasTrs ? (
                            isOpen ? <IconChevronDown size={14} className="text-black/30" /> : <IconChevronRight size={14} className="text-black/30" />
                          ) : <span className="inline-block w-[14px]" />}
                          {formatDate(p.fecha_pago)}
                        </td>
                        <td className="px-3 py-2.5"><MonoAmount value={Number(p.monto_total)} /></td>
                        <td className="px-3 py-2.5 capitalize text-black/60">{p.metodo}</td>
                        <td className="px-3 py-2.5 font-mono text-black/60">{p.referencia_banco || "—"}</td>
                        <td className="px-3 py-2.5 text-black/60">{p.banco_origen || "—"}</td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => abrirModal(p)}
                            className="inline-flex items-center gap-1 rounded-md bg-sidebar-accent px-2.5 py-1.5 text-etiqueta font-medium text-sidebar-accentText hover:brightness-110 transition"
                          >
                            <IconArrowRight size={13} /> Trasladar
                          </button>
                        </td>
                      </tr>
                      {isOpen && hasTrs && (
                        <tr>
                          <td colSpan={6} className="px-3 pb-3 pt-0">
                            <div className="ml-6 rounded-md border-[0.5px] border-black/10 bg-black/[0.02]">
                              <div className="px-3 py-1.5 text-etiqueta font-medium uppercase tracking-wider text-black/40 border-b-[0.5px] border-black/10">
                                Traslados realizados desde este depósito
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-etiqueta uppercase tracking-wider text-black/35">
                                    <th className="px-3 py-1.5">Fecha</th>
                                    <th className="px-3 py-1.5">Propiedad</th>
                                    <th className="px-3 py-1.5">Propietario</th>
                                    <th className="px-3 py-1.5 text-right">Monto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.traslados.map((t) => (
                                    <tr key={t.id} className="border-t-[0.5px] border-black/5">
                                      <td className="px-3 py-1.5">{formatDate(t.fecha)}</td>
                                      <td className="px-3 py-1.5 font-medium">{t.numero_propiedad}</td>
                                      <td className="px-3 py-1.5 text-black/60">{t.propietario || "—"}</td>
                                      <td className="px-3 py-1.5 text-right"><MonoAmount value={Number(t.monto)} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )
      )}

      {tab === "historial" && (
        historial.length === 0 ? (
          <Panel><p className="py-6 text-center text-black/40">No hay traslados registrados</p></Panel>
        ) : (
          <Panel>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-[0.5px] border-black/10 text-left text-etiqueta uppercase tracking-wider text-black/45">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Monto</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">Propietario</th>
                  <th className="px-3 py-2">Justificación</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((t) => (
                  <tr key={t.id} className="border-b-[0.5px] border-black/5 last:border-0">
                    <td className="px-3 py-2.5">{formatDate(t.created_at)}</td>
                    <td className="px-3 py-2.5"><MonoAmount value={Number(t.monto_total)} /></td>
                    <td className="px-3 py-2.5">{t.numero_propiedad}</td>
                    <td className="px-3 py-2.5 text-black/60">{t.propietario || "—"}</td>
                    <td className="px-3 py-2.5 text-black/50 max-w-[300px] truncate">{t.justificacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )
      )}

      {modal && (
        <Modal title="Trasladar depósito" onClose={() => setModal(null)} width="max-w-lg">
          <div className="space-y-4">
            {/* Info del pago */}
            <div className="rounded-md border-[0.5px] border-black/10 bg-black/[0.02] p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-black/45">Monto total</span>
                <MonoAmount value={Number(modal.monto_total)} className="font-medium" />
              </div>
              <div className="flex justify-between">
                <span className="text-black/45">Método</span>
                <span className="capitalize">{modal.metodo}</span>
              </div>
              {modal.referencia_banco && (
                <div className="flex justify-between">
                  <span className="text-black/45">Referencia</span>
                  <span className="font-mono">{modal.referencia_banco}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-black/45">Fecha</span>
                <span>{formatDate(modal.fecha_pago)}</span>
              </div>
            </div>

            {/* Monto a trasladar */}
            <div className="space-y-1">
              <label className="text-etiqueta font-medium uppercase tracking-wide text-black/45">Monto a trasladar</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={Number(modal.monto_total)}
                value={montoTrasladar}
                onChange={(e) => setMontoTrasladar(e.target.value)}
                className="w-full rounded-md border-[0.5px] border-black/15 bg-white px-3 py-2 text-sm font-mono focus:border-sidebar-accent focus:outline-none"
              />
              {Number(montoTrasladar) < Number(modal.monto_total) - 0.001 && Number(montoTrasladar) > 0 && (
                <p className="text-xs text-sidebar-accent">
                  Traslado parcial — <MonoAmount value={Number(modal.monto_total) - Number(montoTrasladar)} className="inline" /> quedará en especiales
                </p>
              )}
            </div>

            {/* Fecha del traslado */}
            <div className="space-y-1">
              <label className="text-etiqueta font-medium uppercase tracking-wide text-black/45">Fecha del traslado</label>
              <input
                type="date"
                value={fechaTraslado}
                min={modal.fecha_pago.slice(0, 10)}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setFechaTraslado(e.target.value)}
                className="w-full rounded-md border-[0.5px] border-black/15 bg-white px-3 py-2 text-sm focus:border-sidebar-accent focus:outline-none"
              />
            </div>

            {/* Propiedad destino */}
            <div className="space-y-1">
              <label className="text-etiqueta font-medium uppercase tracking-wide text-black/45">Propiedad destino</label>
              <div className="relative">
                <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black/30" />
                <input
                  value={destino ? (destInfo ? `${destInfo.numero_propiedad ?? destInfo.id} — ${destInfo.propietario ?? ""}` : destino) : busqDest}
                  onChange={(e) => { setBusqDest(e.target.value); if (destino) setDestino(""); }}
                  placeholder="Buscar propiedad o propietario..."
                  className="w-full rounded-md border-[0.5px] border-black/15 bg-white py-2 pl-8 pr-3 text-sm focus:border-sidebar-accent focus:outline-none"
                />
              </div>
              {!destino && busqDest && unidadesFiltradas.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border-[0.5px] border-black/15 bg-white shadow-lg">
                  {unidadesFiltradas.slice(0, 20).map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { seleccionarDestino(u.id); setBusqDest(""); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-black/[0.03]"
                    >
                      <span>{u.numero_propiedad ?? u.id}</span>
                      <span className="text-black/40 text-xs">{u.propietario}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Justificación */}
            <div className="space-y-1">
              <label className="text-etiqueta font-medium uppercase tracking-wide text-black/45">Justificación *</label>
              <textarea
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                rows={2}
                placeholder="Motivo del traslado..."
                className="w-full rounded-md border-[0.5px] border-black/15 bg-white p-2.5 text-sm focus:border-sidebar-accent focus:outline-none resize-none"
              />
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setModal(null)}
                className="rounded-md px-4 py-2 text-sm text-black/50 hover:text-ink hover:bg-black/[0.03] transition"
              >
                Cancelar
              </button>
              <button
                onClick={enviar}
                disabled={!destino || !justificacion.trim() || enviando || !Number(montoTrasladar) || Number(montoTrasladar) <= 0 || Number(montoTrasladar) > Number(modal.monto_total)}
                className="inline-flex items-center gap-1.5 rounded-md bg-sidebar-accent px-4 py-2 text-sm font-medium text-sidebar-accentText hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none transition"
              >
                {enviando ? "Trasladando..." : <><IconArrowRight size={14} /> Confirmar traslado</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-[0.5px] border-b-2 px-3 py-2 text-base transition-colors ${
        active ? "border-sidebar-accent font-medium text-ink" : "border-transparent text-black/45 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
