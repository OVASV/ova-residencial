import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconReceipt2, IconBolt, IconPlus, IconTrash, IconCashBanknote, IconArrowsLeftRight, IconPrinter, IconLock, IconPencil, IconRotateClockwise2 } from "@tabler/icons-react";
import {
  getCargos,
  generarCargos,
  generarCargosPreview,
  addCargo,
  deleteCargo,
  getUnidades,
  getEstadoCuenta,
  getPagos,
  registrarPago,
  editarPago,
  anularPago,
  reactivarPago,
  subirComprobantePago,
  quitarComprobantePago,
  getCuotas,
  getCierres,
  type Cargo,
  type Unidad,
  type Pago,
  type MetodoPago,
  type GenerarResultado,
  type GenerarPreview,
  type Catalogo,
  type Cuota,
  getBancos,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import MonoAmount from "../../components/ui/MonoAmount";
import ComprobanteCell from "../../components/ui/ComprobanteCell";
import { inputCls, labelCls } from "../../components/ui/form";
import { formatDate, formatCurrency } from "../../utils/formatters";

const mesActual = () => new Date().toISOString().slice(0, 7);

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-estado-pendiente/15 text-estado-pendiente",
  parcial: "bg-estado-pendiente/15 text-estado-pendiente",
  pagado: "bg-estado-pagado/12 text-estado-pagado",
  registrado: "bg-estado-pagado/12 text-estado-pagado",
  anulado: "bg-black/5 text-black/45",
};

type Tab = "cargos" | "pagos";

export default function Pagos() {
  const [periodo, setPeriodo] = useState(mesActual());
  const [tab, setTab] = useState<Tab>("cargos");
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showPago, setShowPago] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [cerrado, setCerrado] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([getCargos(periodo), getPagos(periodo), getUnidades()])
      .then(([c, p, u]) => {
        setCargos(c);
        setPagos(p);
        setUnidades(u);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    getCierres()
      .then((cs) => setCerrado(cs.some((c) => c.periodo === periodo && c.cerrado)))
      .catch(() => setCerrado(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  function onGenerado(r: GenerarResultado) {
    const extra = r.sin_categoria.length
      ? ` · ${r.sin_categoria.length} sin categoría omitidas: ${r.sin_categoria.join(", ")}`
      : "";
    setMsg(`Generación ${r.periodo}: ${r.creados} cargo(s) sobre ${r.unidades_procesadas} unidad(es)${extra}`);
    setShowPreview(false);
    load();
  }

  const totalMes = cargos.filter((c) => c.estado !== "anulado").reduce((s, c) => s + Number(c.monto), 0);
  const totalCobrado = pagos.filter((p) => p.estado !== "anulado").reduce((s, p) => s + Number(p.monto_total), 0);
  // Pendiente del mes = facturado − cobrado (en tiempo real, igual que el dashboard)
  const totalPendiente = Math.max(0, Math.round((totalMes - totalCobrado) * 100) / 100);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Pagos y facturación</h1>
          <p className="text-base text-black/50">Cargos y cobros por período</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className={labelCls}>Período</span>
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className={`${inputCls} mt-1 py-1.5`}
            />
          </label>
          <Button variant="secondary" onClick={() => setShowAdd(true)} disabled={cerrado} title={cerrado ? "Mes cerrado" : undefined}>
            <IconPlus size={16} /> Cargo
          </Button>
          <Button variant="secondary" onClick={() => { setMsg(null); setError(null); setShowPreview(true); }} disabled={cerrado} title={cerrado ? "Mes cerrado" : undefined}>
            <IconBolt size={16} /> Generar
          </Button>
          <Link to="/pagos/conciliacion">
            <Button variant="secondary">
              <IconArrowsLeftRight size={16} /> Conciliación
            </Button>
          </Link>
          <Button onClick={() => setShowPago(true)} disabled={cerrado} title={cerrado ? "Mes cerrado" : undefined}>
            <IconCashBanknote size={16} /> Registrar pago
          </Button>
        </div>
      </div>

      {cerrado && (
        <div className="flex items-start gap-2 rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/5 px-4 py-2.5 text-base text-ink">
          <IconLock size={17} className="mt-0.5 shrink-0 text-estado-atrasado" />
          <div>
            <span className="font-medium">Mes cerrado contablemente.</span>{" "}
            No se pueden generar ni ingresar cargos, ni registrar pagos en {periodo}. Solo el superadministrador puede reabrirlo desde el Libro de caja.
          </div>
        </div>
      )}

      {msg && (
        <div className="rounded-md border-[0.5px] border-estado-pagado/30 bg-estado-pagado/10 p-3 text-base text-estado-pagado">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-3 text-base text-estado-atrasado">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        <Kpi label="Facturado del mes" value={totalMes} />
        <Kpi label="Cobrado del mes" value={totalCobrado} tone="text-estado-pagado" />
        <Kpi label="Pendiente de cobro" value={totalPendiente} tone="text-estado-pendiente" />
      </div>

      <div className="flex gap-1 border-b-[0.5px] border-black/15">
        <TabBtn active={tab === "cargos"} onClick={() => setTab("cargos")}>
          Cargos
        </TabBtn>
        <TabBtn active={tab === "pagos"} onClick={() => setTab("pagos")}>
          Pagos
        </TabBtn>
      </div>

      {loading ? (
        <div className="py-8 text-center text-base text-black/40">Cargando…</div>
      ) : tab === "cargos" ? (
        <CargosTable cargos={cargos} unidades={unidades} onChange={load} cerrado={cerrado} />
      ) : (
        <PagosTable pagos={pagos} unidades={unidades} onChange={load} cerrado={cerrado} />
      )}

      {showAdd && (
        <AgregarCargoModal
          periodo={periodo}
          unidades={unidades}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
      {showPago && (
        <RegistrarPagoModal
          unidades={unidades}
          onClose={() => setShowPago(false)}
          onSaved={() => {
            setShowPago(false);
            load();
          }}
        />
      )}
      {showPreview && (
        <GenerarPreviewModal
          periodo={periodo}
          onClose={() => setShowPreview(false)}
          onGenerado={onGenerado}
        />
      )}
    </div>
  );
}

// Preview de la generación: muestra qué cargos se crearán, agrupados por
// concepto (tipo de pago), con el botón final para confirmar la generación.
function GenerarPreviewModal({
  periodo,
  onClose,
  onGenerado,
}: {
  periodo: string;
  onClose: () => void;
  onGenerado: (r: GenerarResultado) => void;
}) {
  const [data, setData] = useState<GenerarPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    generarCargosPreview(periodo)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al calcular el preview"));
  }, [periodo]);

  async function confirmar() {
    setGenerando(true);
    setError(null);
    try {
      onGenerado(await generarCargos(periodo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar");
      setGenerando(false);
    }
  }

  return (
    <Modal title={`Generar cuotas · ${periodo}`} onClose={onClose} width="max-w-6xl">
      {error && <div className="mb-3 text-base text-estado-atrasado">{error}</div>}
      {!data ? (
        <div className="py-8 text-center text-base text-black/40">Calculando…</div>
      ) : data.total_cargos === 0 ? (
        <div className="space-y-4">
          <p className="py-4 text-center text-base text-black/55">
            No hay cargos nuevos por generar para {periodo}. Ya están todos creados o no hay
            tarifas/categorías aplicables.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-base text-black/55">
            Se generarán <span className="font-medium text-ink">{data.total_cargos}</span> cargo(s)
            sobre {data.unidades_procesadas} unidad(es). Revisa el detalle por tipo:
          </p>

          {/* Resumen compacto por concepto */}
          <div className="flex flex-wrap gap-1.5">
            {data.por_concepto.map((g) => (
              <span key={g.concepto} className="rounded-full bg-black/5 px-2.5 py-0.5 text-etiqueta text-black/60">
                {g.concepto}: {g.cantidad} · <span className="font-mono">{formatCurrency(g.total)}</span>
              </span>
            ))}
          </div>

          {/* Detalle por propiedad */}
          <div className="max-h-80 overflow-auto rounded-md border-[0.5px] border-black/15">
            <table className="w-full text-tabla">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                  <th className="px-2 py-1.5 font-medium">Código</th>
                  <th className="px-2 py-1.5 font-medium">N° casa/lote</th>
                  <th className="px-2 py-1.5 font-medium">Calle</th>
                  <th className="px-2 py-1.5 font-medium">Bloque</th>
                  <th className="px-2 py-1.5 font-medium">Tipo</th>
                  <th className="px-2 py-1.5 font-medium">Propietario</th>
                  <th className="px-2 py-1.5 font-medium">Concepto</th>
                  <th className="px-2 py-1.5 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.por_propiedad.map((p) => (
                  <tr key={p.id} className="border-b-[0.5px] border-black/5">
                    <td className="px-2 py-1.5 font-mono font-medium">{p.id}</td>
                    <td className="px-2 py-1.5 font-mono">{p.numero_propiedad ?? "—"}</td>
                    <td className="px-2 py-1.5">{p.calle ?? "—"}</td>
                    <td className="px-2 py-1.5">{p.bloque ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {p.tipo ?? <span className="text-black/35">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {p.propietario ?? <span className="text-black/35">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-black/60">
                      {p.conceptos.map((c) => c.concepto).join(", ")}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <MonoAmount value={p.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t-[0.5px] border-black/10 pt-2 text-base">
            <span className="text-black/55">Total a generar</span>
            <MonoAmount value={data.total_monto} className="text-lg font-semibold" />
          </div>

          {data.sin_categoria.length > 0 && (
            <div className="rounded-md border-[0.5px] border-estado-pendiente/30 bg-estado-pendiente/10 p-2 text-base text-estado-pendiente">
              {data.sin_categoria.length} unidad(es) sin categoría no recibirán mantenimiento:{" "}
              <span className="font-mono">{data.sin_categoria.join(", ")}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={confirmar} disabled={generando}>
              <IconBolt size={16} /> {generando ? "Generando…" : `Generar ${data.total_cargos} cargo(s)`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Kpi({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border-[0.5px] border-black/15 bg-white p-3.5">
      <div className="mb-1 text-etiqueta uppercase tracking-wide text-black/45">{label}</div>
      <MonoAmount value={value} className={`text-lg font-semibold ${tone}`} />
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

function unidadLabel(id: string, unidades: Unidad[]) {
  const u = unidades.find((x) => x.id === id);
  if (!u) return id;
  const prop = u.propietario_actual;
  return `${u.numero_propiedad ?? u.id} — ${prop ? `${prop.nombre} ${prop.apellido}` : ""}`;
}

function CargosTable({ cargos, unidades, onChange, cerrado }: { cargos: Cargo[]; unidades: Unidad[]; onChange: () => void; cerrado: boolean }) {
  return (
    <Panel>
      {cargos.length === 0 ? (
        <EmptyState
          icon={<IconReceipt2 size={28} stroke={1.5} />}
          title="No hay cargos en este período"
          hint="Usa «Generar» para crearlos según categoría y tarifas"
        />
      ) : (
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">Unidad</th>
              <th className="py-1.5 font-medium">Concepto</th>
              <th className="py-1.5 font-medium">Estado</th>
              <th className="py-1.5 text-right font-medium">Monto</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {cargos.map((c) => (
              <tr key={c.id} className="border-b-[0.5px] border-black/5">
                <td className="py-2 font-medium">{unidadLabel(c.id_unidad, unidades)}</td>
                <td className="py-2">{c.concepto}</td>
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${ESTADO_BADGE[c.estado]}`}>
                    {c.estado}
                  </span>
                </td>
                <td className="py-2 text-right"><MonoAmount value={Number(c.monto)} /></td>
                <td className="py-2 text-right">
                  {c.estado !== "anulado" && !cerrado && (
                    <button
                      onClick={async () => {
                        if (confirm(`¿Anular el cargo "${c.concepto}" de ${c.id_unidad}?`)) {
                          await deleteCargo(c.id);
                          onChange();
                        }
                      }}
                      className="text-black/40 hover:text-estado-atrasado"
                      aria-label="Anular cargo"
                    >
                      <IconTrash size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-[0.5px] border-black/20 font-semibold">
              <td className="py-2" colSpan={3}>Total cargos del mes ({cargos.filter((c) => c.estado !== "anulado").length})</td>
              <td className="py-2 text-right"><MonoAmount value={cargos.filter((c) => c.estado !== "anulado").reduce((s, c) => s + Number(c.monto), 0)} className="text-ink" /></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
    </Panel>
  );
}

function PagosTable({ pagos, unidades, onChange, cerrado }: { pagos: Pago[]; unidades: Unidad[]; onChange: () => void; cerrado: boolean }) {
  const [editar, setEditar] = useState<Pago | null>(null);
  return (
    <Panel>
      {pagos.length === 0 ? (
        <EmptyState icon={<IconCashBanknote size={28} stroke={1.5} />} title="Sin pagos en este período" />
      ) : (
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">Fecha</th>
              <th className="py-1.5 font-medium">Unidad</th>
              <th className="py-1.5 font-medium">Método</th>
              <th className="py-1.5 font-medium">Referencia</th>
              <th className="py-1.5 font-medium">Descripción</th>
              <th className="py-1.5 text-right font-medium">Monto</th>
              <th className="py-1.5 font-medium">Estado</th>
              <th className="py-1.5 font-medium">Comprobante</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id} className="border-b-[0.5px] border-black/5">
                <td className="py-2 font-mono">{formatDate(p.fecha_pago)}</td>
                <td className="py-2 font-medium">{unidadLabel(p.id_unidad, unidades)}</td>
                <td className="py-2 capitalize">{p.metodo}</td>
                <td className="py-2 font-mono text-black/60">{p.referencia_banco ?? "—"}</td>
                <td className="py-2 text-black/60">
                  {p.descripcion || p.pago_cargos?.map((pc) => pc.cargos.concepto).join(", ") || "—"}
                </td>
                <td className="py-2 text-right"><MonoAmount value={Number(p.monto_total)} /></td>
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${ESTADO_BADGE[p.estado]}`}>
                    {p.estado}
                  </span>
                </td>
                <td className="py-2">
                  <ComprobanteCell
                    url={p.comprobante_url}
                    tipo={p.comprobante_tipo}
                    onSubir={async (f) => { await subirComprobantePago(p.id, f); onChange(); }}
                    onQuitar={async () => { await quitarComprobantePago(p.id); onChange(); }}
                  />
                </td>
                <td className="py-2 text-right flex items-center justify-end gap-1">
                  <a
                    href={`/pagos/recibo/pdf?ids=${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Imprimir recibo"
                    className="inline-flex rounded p-1 text-black/40 hover:bg-black/5 hover:text-[#085041]"
                  >
                    <IconPrinter size={15} />
                  </a>
                  {p.estado !== "anulado" && !cerrado && (
                    <button
                      onClick={() => setEditar(p)}
                      className="text-black/40 hover:text-sidebar-accent"
                      aria-label="Editar pago"
                      title="Editar descripción / referencia"
                    >
                      <IconPencil size={15} />
                    </button>
                  )}
                  {p.estado !== "anulado" && !cerrado && (
                    <button
                      onClick={async () => {
                        if (confirm("¿Anular este pago? Se restaurarán los saldos de los cargos.")) {
                          await anularPago(p.id);
                          onChange();
                        }
                      }}
                      className="text-black/40 hover:text-estado-atrasado"
                      aria-label="Anular pago"
                    >
                      <IconTrash size={16} />
                    </button>
                  )}
                  {p.estado === "anulado" && !cerrado && (
                    <button
                      onClick={async () => {
                        if (confirm("¿Reactivar este pago? Se volverá a aplicar a los cargos y quedará como registrado.")) {
                          try {
                            await reactivarPago(p.id);
                            onChange();
                          } catch (e) {
                            alert((e as Error).message);
                          }
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md border-[0.5px] border-estado-pagado/40 px-2 py-1 text-etiqueta font-medium text-estado-pagado hover:bg-estado-pagado/10"
                      title="Reactivar pago anulado"
                    >
                      <IconRotateClockwise2 size={14} /> Reactivar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-[0.5px] border-black/20 font-semibold">
              <td className="py-2" colSpan={5}>Total pagos del mes ({pagos.filter((p) => p.estado !== "anulado").length})</td>
              <td className="py-2 text-right"><MonoAmount value={pagos.filter((p) => p.estado !== "anulado").reduce((s, p) => s + Number(p.monto_total), 0)} className="text-estado-pagado" /></td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      )}
      {editar && (
        <EditarPagoModal
          pago={editar}
          onClose={() => setEditar(null)}
          onSaved={() => { setEditar(null); onChange(); }}
        />
      )}
    </Panel>
  );
}

function EditarPagoModal({ pago, onClose, onSaved }: { pago: Pago; onClose: () => void; onSaved: () => void }) {
  const [descripcion, setDescripcion] = useState(pago.descripcion ?? "Cuota de mantenimiento");
  const [referencia, setReferencia] = useState(pago.referencia_banco ?? "");
  const [banco, setBanco] = useState(pago.banco_origen ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await editarPago(pago.id, {
        descripcion: descripcion.trim() || "Cuota de mantenimiento",
        referencia_banco: referencia.trim(),
        banco_origen: banco.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar pago" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <label className="block">
          <span className={labelCls}>Descripción</span>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Cuota de mantenimiento" className={`${inputCls} mt-1`} />
        </label>
        <label className="block">
          <span className={labelCls}>Referencia</span>
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="block">
          <span className={labelCls}>Banco origen</span>
          <input value={banco} onChange={(e) => setBanco(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AgregarCargoModal({
  periodo,
  unidades,
  onClose,
  onSaved,
}: {
  periodo: string;
  unidades: Unidad[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [idUnidad, setIdUnidad] = useState("");
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [idCuota, setIdCuota] = useState("");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCuotas().then((c) => setCuotas(c.filter((x) => x.activo))).catch(() => {});
  }, []);

  const cuotaSel = cuotas.find((c) => c.id === idCuota);

  function onCuotaChange(id: string) {
    setIdCuota(id);
    const c = cuotas.find((x) => x.id === id);
    if (c) setMonto(String(c.monto));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!cuotaSel) return setError("Selecciona una tarifa");
    setSaving(true);
    try {
      const concepto = descripcion.trim()
        ? `${cuotaSel.concepto} — ${descripcion.trim()}`
        : cuotaSel.concepto;
      await addCargo({ id_unidad: idUnidad, periodo, concepto, monto: Number(monto || 0) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al agregar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Agregar cargo · ${periodo}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <label className="block">
          <span className={labelCls}>Unidad *</span>
          <select value={idUnidad} onChange={(e) => setIdUnidad(e.target.value)} required className={`${inputCls} mt-1`}>
            <option value="">Seleccionar…</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.numero_propiedad ?? u.id} — {u.propietario_actual ? `${u.propietario_actual.nombre} ${u.propietario_actual.apellido}` : "Sin propietario"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Tarifa *</span>
          <select value={idCuota} onChange={(e) => onCuotaChange(e.target.value)} required className={`${inputCls} mt-1`}>
            <option value="">Seleccionar…</option>
            {cuotas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.concepto}{c.estados_unidad ? ` (${c.estados_unidad.nombre})` : ""} — {formatCurrency(Number(c.monto))}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Descripción</span>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>Monto (USD) *</span>
            <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required className={`${inputCls} mt-1 font-mono`} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving || !idUnidad}>{saving ? "Guardando…" : "Agregar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function UnidadSearch({ unidades, value, onChange }: { unidades: Unidad[]; value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const selUnidad = unidades.find((u) => u.id === value);
  const filtradas = unidades.filter((u) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    const prop = u.propietario_actual;
    return (
      (u.numero_propiedad?.toLowerCase().includes(s)) ||
      u.id.toLowerCase().includes(s) ||
      (prop && `${prop.nombre} ${prop.apellido}`.toLowerCase().includes(s)) ||
      (u.calle?.toLowerCase().includes(s))
    );
  });

  // Agrupar por propietario para mostrar separadas las unidades de un mismo dueño
  const grupos: { propietario: string; propId: string | null; unids: Unidad[] }[] = [];
  const porProp = new Map<string, Unidad[]>();
  for (const u of filtradas) {
    const prop = u.propietario_actual;
    const key = prop ? prop.id : `_none_${u.id}`;
    if (!porProp.has(key)) porProp.set(key, []);
    porProp.get(key)!.push(u);
  }
  for (const [, us] of porProp) {
    const prop = us[0].propietario_actual;
    grupos.push({
      propietario: prop ? `${prop.nombre} ${prop.apellido}` : "Sin propietario",
      propId: prop?.id ?? null,
      unids: us,
    });
  }

  return (
    <div className="relative">
      {value && selUnidad ? (
        <div className="flex items-center gap-2">
          <div className={`${inputCls} mt-1 flex-1 flex items-center justify-between`}>
            <span>{selUnidad.numero_propiedad ?? selUnidad.id} — {selUnidad.propietario_actual ? `${selUnidad.propietario_actual.nombre} ${selUnidad.propietario_actual.apellido}` : "Sin propietario"}</span>
          </div>
          <button type="button" onClick={() => { onChange(""); setQ(""); }} className="mt-1 rounded-md border-[0.5px] border-black/15 px-2 py-1.5 text-etiqueta text-black/50 hover:bg-black/5">
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar por número, propietario o calle…"
            className={`${inputCls} mt-1`}
          />
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-black/15 bg-white shadow-lg">
                {filtradas.length === 0 ? (
                  <div className="px-3 py-2 text-base text-black/40">Sin resultados</div>
                ) : (
                  grupos.map((g) => (
                    <div key={g.propId ?? g.unids[0].id}>
                      {g.unids.length > 1 && (
                        <div className="sticky top-0 bg-black/[0.03] px-3 py-1 text-etiqueta font-medium text-black/50">
                          {g.propietario} · {g.unids.length} unidades
                        </div>
                      )}
                      {g.unids.map((u) => {
                        const prop = u.propietario_actual;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => { onChange(u.id); setOpen(false); setQ(""); }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-base hover:bg-black/5 ${g.unids.length > 1 ? "pl-5" : ""}`}
                          >
                            <span className="font-mono font-medium">{u.numero_propiedad ?? u.id}</span>
                            {g.unids.length === 1 && (
                              <span className="text-black/60">{prop ? `${prop.nombre} ${prop.apellido}` : "Sin propietario"}</span>
                            )}
                            {u.calle && <span className="text-black/35 text-etiqueta">· {u.calle}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function RegistrarPagoModal({
  unidades,
  onClose,
  onSaved,
}: {
  unidades: Unidad[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [idUnidad, setIdUnidad] = useState("");
  const [saldoPendiente, setSaldoPendiente] = useState(0);
  const [cuotaMensual, setCuotaMensual] = useState(0);
  const [metodo, setMetodo] = useState<MetodoPago>("transferencia");
  const [referencia, setReferencia] = useState("");
  const [banco, setBanco] = useState("");
  const [bancos, setBancos] = useState<Catalogo[]>([]);
  const [descripcion, setDescripcion] = useState("Cuota de mantenimiento");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [montoLibre, setMontoLibre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBancos().then((b) => setBancos(b.filter((x) => x.activo))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!idUnidad) {
      setSaldoPendiente(0);
      setCuotaMensual(0);
      setMontoLibre("");
      return;
    }
    getEstadoCuenta(idUnidad).then((ec) => {
      // Saldo real en tiempo real (Σ cargos − Σ pagos); negativo = crédito a favor
      setSaldoPendiente(Number(ec.kpis.saldo_pendiente));
      // Cuota mensual = monto del cargo más reciente (cargos vienen ordenados desc)
      const ultimo = ec.cargos[0];
      if (ultimo) {
        setCuotaMensual(Number(ultimo.monto));
        setMontoLibre(String(ultimo.monto));
      }
    });
  }, [idUnidad]);

  const total = Number(montoLibre || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (total <= 0) return setError("El monto debe ser mayor a 0");
    if (metodo !== "efectivo" && !referencia.trim()) return setError("La referencia es requerida para transferencia/cheque");

    setSaving(true);
    try {
      await registrarPago({
        id_unidad: idUnidad,
        fecha_pago: fecha,
        metodo,
        banco_origen: banco.trim() || undefined,
        referencia_banco: referencia.trim() || undefined,
        descripcion: descripcion.trim() || undefined,
        monto_total: Number(montoLibre),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el pago");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Registrar pago" onClose={onClose} width="max-w-2xl">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={labelCls}>Unidad *</span>
            <UnidadSearch unidades={unidades} value={idUnidad} onChange={setIdUnidad} />
          </div>
          <label className="block">
            <span className={labelCls}>Fecha de pago *</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={`${inputCls} mt-1`} />
          </label>
        </div>

        {idUnidad && (
          <div className="space-y-2">
            {(() => {
              const u = unidades.find((x) => x.id === idUnidad);
              const estado = u?.estado_actual?.nombre;
              return (
                <div className="flex items-center gap-3 rounded-md border-[0.5px] border-black/10 bg-black/[0.02] px-3 py-2 text-base text-black/55">
                  {estado && (
                    <span className="rounded-full bg-sidebar-accent/10 px-2 py-0.5 text-etiqueta font-medium uppercase text-sidebar-accent">
                      {estado}
                    </span>
                  )}
                  {cuotaMensual > 0 && (
                    <span>Cuota: <span className="font-mono font-medium">{formatCurrency(cuotaMensual)}</span>/mes</span>
                  )}
                  {saldoPendiente > 0 && (
                    <span className="ml-auto">Saldo pendiente: <span className="font-mono font-semibold text-estado-pendiente">{formatCurrency(saldoPendiente)}</span></span>
                  )}
                </div>
              );
            })()}
            <label className="block">
              <span className={labelCls}>Valor a pagar *</span>
              <input
                type="number"
                step="0.01"
                value={montoLibre}
                onChange={(e) => setMontoLibre(e.target.value)}
                placeholder="0.00"
                required
                className={`${inputCls} mt-1 w-48 font-mono`}
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className={labelCls}>Método</span>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className={`${inputCls} mt-1`}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Referencia{metodo !== "efectivo" ? " *" : ""}</span>
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              disabled={metodo === "efectivo"}
              className={`${inputCls} mt-1 disabled:bg-black/5`}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Banco origen</span>
            <select value={banco} onChange={(e) => setBanco(e.target.value)} disabled={metodo === "efectivo"} className={`${inputCls} mt-1 disabled:bg-black/5`}>
              <option value="">Seleccionar…</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.nombre}>{b.nombre}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className={labelCls}>Descripción</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Cuota de mantenimiento"
            className={`${inputCls} mt-1`}
          />
        </label>

        <div className="flex items-center justify-between border-t-[0.5px] border-black/10 pt-3">
          <div className="text-base">
            Total: <MonoAmount value={total} className="font-semibold" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || !idUnidad || total <= 0}>
              {saving ? "Registrando…" : "Registrar pago"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
