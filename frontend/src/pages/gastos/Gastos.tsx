import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconPlus, IconTrash, IconPencil, IconReceipt2, IconAdjustments, IconArrowRight, IconLock } from "@tabler/icons-react";
import {
  getGastos,
  getResumenGastos,
  getPresupuesto,
  setPresupuesto,
  copiarPresupuesto,
  createGasto,
  deleteGasto,
  updateGasto,
  subirComprobanteGasto,
  quitarComprobanteGasto,
  getItemsPresupuesto,
  getCierres,
  type Gasto,
  type ResumenGastos,
  type PresupuestoItem,
  type ItemPresupuesto,
  type CategoriaGasto,
  type NuevoGastoPayload,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import MonoAmount from "../../components/ui/MonoAmount";
import ComprobanteCell from "../../components/ui/ComprobanteCell";
import { inputCls, labelCls } from "../../components/ui/form";
import { formatDate, formatCurrency } from "../../utils/formatters";

const CATS: { id: CategoriaGasto; label: string; color: string }[] = [
  { id: "seguridad", label: "Seguridad", color: "#E24B4A" },
  { id: "limpieza", label: "Limpieza", color: "#EF9F27" },
  { id: "mantenimiento", label: "Mantenimiento", color: "#4A90D9" },
  { id: "servicios", label: "Servicios", color: "#7B5EA7" },
  { id: "administrativo", label: "Administrativo", color: "#1D9E75" },
  { id: "planilla", label: "Planilla", color: "#0891B2" },
  { id: "extraordinario", label: "Extraordinario", color: "#888888" },
  { id: "ajuste", label: "Ajuste / Saldo inicial", color: "#64748B" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const mesActual = () => new Date().toISOString().slice(0, 7);

export default function Gastos() {
  const [periodo, setPeriodo] = useState(mesActual());
  const [resumen, setResumen] = useState<ResumenGastos | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [filtroCat, setFiltroCat] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showGasto, setShowGasto] = useState(false);
  const [editGasto, setEditGasto] = useState<Gasto | null>(null);
  const [showPresup, setShowPresup] = useState(false);
  const [cerrado, setCerrado] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([getResumenGastos(periodo), getGastos(periodo, filtroCat || undefined)])
      .then(([r, g]) => {
        setResumen(r);
        setGastos(g);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    getCierres()
      .then((cs) => setCerrado(cs.some((c) => c.periodo === periodo && c.cerrado)))
      .catch(() => setCerrado(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, filtroCat]);

  const k = resumen?.kpis;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Gastos</h1>
          <p className="text-base text-black/50">Gasto vs presupuesto por categoría</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className={labelCls}>Período</span>
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={`${inputCls} mt-1 py-1.5`} />
          </label>
          <Button variant="secondary" onClick={() => setShowPresup(true)}>
            <IconAdjustments size={16} /> Presupuesto
          </Button>
          <Button onClick={() => setShowGasto(true)} disabled={cerrado} title={cerrado ? "Mes cerrado" : undefined}>
            <IconPlus size={16} /> Nuevo gasto
          </Button>
        </div>
      </div>

      {cerrado && (
        <div className="flex items-start gap-2 rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/5 px-4 py-2.5 text-base text-ink">
          <IconLock size={17} className="mt-0.5 shrink-0 text-estado-atrasado" />
          <div>
            <span className="font-medium">Mes cerrado contablemente.</span>{" "}
            No se pueden registrar ni modificar gastos en {periodo}. Solo el superadministrador puede reabrirlo desde el Libro de caja.
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Gastado del mes" value={k?.total_gastado ?? 0} />
        <Kpi label="Presupuesto" value={k?.total_presupuesto ?? 0} />
        <Kpi
          label="Disponible"
          value={k?.disponible ?? 0}
          tone={(k?.disponible ?? 0) < 0 ? "text-estado-atrasado" : "text-estado-pagado"}
        />
        <div className="rounded-lg border-[0.5px] border-black/15 bg-white p-3.5">
          <div className="mb-1 text-etiqueta uppercase tracking-wide text-black/45">Transacciones</div>
          <div className="font-mono text-lg font-semibold">{k?.num_transacciones ?? 0}</div>
          {k?.variacion_pct != null && (
            <div className={`text-etiqueta ${k.variacion_pct > 0 ? "text-estado-atrasado" : "text-estado-pagado"}`}>
              {k.variacion_pct > 0 ? "▲" : "▼"} {Math.abs(k.variacion_pct)}% vs mes anterior
            </div>
          )}
        </div>
      </div>

      {/* Comparación: gráfica (izq) + presupuesto con saldo (der) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Presupuesto vs ejecutado"
          action={
            <Link to={`/gastos/reporte?periodo=${periodo}`} target="_blank" className="flex items-center gap-1 text-base text-sidebar-accent hover:underline">
              Ver reporte <IconArrowRight size={15} />
            </Link>
          }
        >
          {!resumen ? <div className="py-12 text-center text-base text-black/40">Cargando…</div> : <ComparativoChart categorias={resumen.categorias} />}
        </Panel>

        <Panel title="Presupuesto por categoría">
          {!resumen ? <div className="py-12 text-center text-base text-black/40">Cargando…</div> : <PresupuestoLista categorias={resumen.categorias} />}
        </Panel>
      </div>

      {/* Tabla de gastos */}
      <Panel
        title="Detalle de gastos"
        action={
          <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} className={`${inputCls} w-44 py-1`}>
            <option value="">Todas las categorías</option>
            {CATS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        }
      >
        {loading ? (
          <div className="py-8 text-center text-base text-black/40">Cargando…</div>
        ) : gastos.length === 0 ? (
          <EmptyState icon={<IconReceipt2 size={28} stroke={1.5} />} title="Sin gastos en este período" />
        ) : (
          <table className="w-full text-tabla">
            <thead>
              <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                <th className="py-1.5 font-medium">Fecha</th>
                <th className="py-1.5 font-medium">Categoría</th>
                <th className="py-1.5 font-medium">Descripción</th>
                <th className="py-1.5 font-medium">Proveedor</th>
                <th className="py-1.5 font-medium">Método</th>
                <th className="py-1.5 text-right font-medium">Monto</th>
                <th className="py-1.5 font-medium">Comprobante</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id} className="border-b-[0.5px] border-black/5">
                  <td className="py-2 font-mono">{formatDate(g.fecha)}</td>
                  <td className="py-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase"
                      style={{ background: `${CAT[g.categoria].color}22`, color: CAT[g.categoria].color }}
                    >
                      {CAT[g.categoria].label}
                    </span>
                    {g.item_nombre && <div className="mt-0.5 text-etiqueta text-black/45">{g.item_nombre}</div>}
                  </td>
                  <td className="py-2">{g.descripcion}</td>
                  <td className="py-2 text-black/60">{g.proveedor ?? "—"}</td>
                  <td className="py-2 capitalize text-black/60">{g.metodo ?? "—"}</td>
                  <td className="py-2 text-right"><MonoAmount value={Number(g.monto)} /></td>
                  <td className="py-2">
                    <ComprobanteCell
                      url={g.comprobante_url}
                      tipo={g.comprobante_tipo}
                      onSubir={async (f) => { await subirComprobanteGasto(g.id, f); load(); }}
                      onQuitar={async () => { await quitarComprobanteGasto(g.id); load(); }}
                    />
                  </td>
                  <td className="py-2 text-right">
                    {!cerrado && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditGasto(g)}
                          className="text-black/40 hover:text-sidebar-accent"
                          aria-label="Editar gasto"
                        >
                          <IconPencil size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`¿Eliminar el gasto "${g.descripcion}"?`)) {
                              await deleteGasto(g.id);
                              load();
                            }
                          }}
                          className="text-black/40 hover:text-estado-atrasado"
                          aria-label="Eliminar gasto"
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {showGasto && (
        <NuevoGastoModal periodo={periodo} onClose={() => setShowGasto(false)} onSaved={() => { setShowGasto(false); load(); }} />
      )}
      {editGasto && (
        <NuevoGastoModal periodo={periodo} gasto={editGasto} onClose={() => setEditGasto(null)} onSaved={() => { setEditGasto(null); load(); }} />
      )}
      {showPresup && (
        <PresupuestoModal periodo={periodo} onClose={() => setShowPresup(false)} onSaved={() => { setShowPresup(false); load(); }} />
      )}
    </div>
  );
}

// Gráfica comparativa refinada: barras dobles presupuestado vs ejecutado.
function ComparativoChart({ categorias }: { categorias: ResumenGastos["categorias"] }) {
  const data = categorias.filter((c) => c.presupuestado > 0 || c.ejecutado > 0);
  if (data.length === 0) {
    return <div className="py-12 text-center text-base text-black/35">Define un presupuesto o registra gastos para ver la comparación.</div>;
  }
  const max = Math.max(...data.flatMap((c) => [c.presupuestado, c.ejecutado]), 1);
  const W = 480, H = 196, padX = 6, padT = 16, padB = 38;
  const chartH = H - padT - padB;
  const baseY = padT + chartH;
  const groupW = (W - padX * 2) / data.length;
  const barW = Math.min(15, groupW / 2 - 6);
  const yOf = (v: number) => baseY - (v / max) * chartH;
  const bar = (x: number, v: number, fill: string) => {
    const h = Math.max(v > 0 ? 2 : 0, baseY - yOf(v));
    return <rect x={x} y={baseY - h} width={barW} height={h} rx="2.5" fill={fill} />;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Presupuesto vs ejecutado por categoría">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = baseY - f * chartH;
          return <line key={f} x1={padX} y1={y} x2={W - padX} y2={y} stroke={f === 0 ? "#e0e2e6" : "#f1f2f4"} strokeWidth="1" />;
        })}
        <text x={padX} y={padT - 5} fontSize="8.5" fill="#b0b4ba" fontFamily="monospace">{formatCurrency(max)}</text>
        {data.map((c, i) => {
          const gx = padX + i * groupW + groupW / 2;
          const color = CAT[c.categoria].color;
          return (
            <g key={c.categoria}>
              {bar(gx - barW - 3, c.presupuestado, "#e2e4e8")}
              {bar(gx + 3, c.ejecutado, c.alerta ? "#E24B4A" : color)}
              {c.ejecutado > 0 && (
                <text x={gx + 3 + barW / 2} y={yOf(c.ejecutado) - 4} fontSize="8.5" fill="#6b7077" textAnchor="middle" fontFamily="monospace">
                  {Math.round(c.ejecutado)}
                </text>
              )}
              <text x={gx} y={baseY + 14} fontSize="9.5" fill="#5f6368" textAnchor="middle">{CAT[c.categoria].label.slice(0, 11)}</text>
              {c.alerta && <text x={gx} y={baseY + 26} fontSize="8.5" fill="#E24B4A" textAnchor="middle" fontWeight="600">{c.pct}%</text>}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4 border-t-[0.5px] border-black/8 pt-2 text-etiqueta uppercase tracking-wide text-black/45">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#e2e4e8" }} /> Presupuestado</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" /> Ejecutado</span>
      </div>
    </div>
  );
}

// Lista de presupuesto por categoría con saldo disponible.
function PresupuestoLista({ categorias }: { categorias: ResumenGastos["categorias"] }) {
  const data = categorias.filter((c) => c.presupuestado > 0 || c.ejecutado > 0);
  if (data.length === 0) {
    return <div className="py-12 text-center text-base text-black/35">Sin presupuesto ni gastos este mes.</div>;
  }
  return (
    <div className="space-y-3.5">
      {data.map((c) => {
        const color = CAT[c.categoria].color;
        const sobre = c.disponible < 0;
        return (
          <div key={c.categoria}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-base">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                {CAT[c.categoria].label}
              </span>
              <span className="text-right">
                <MonoAmount value={c.disponible} className={`font-semibold ${sobre ? "text-estado-atrasado" : "text-estado-pagado"}`} />
                <span className="ml-1 text-etiqueta uppercase text-black/40">{sobre ? "sobregiro" : "disp."}</span>
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/8">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, c.pct)}%`, background: c.alerta ? "#E24B4A" : color }} />
              </div>
              <span className="w-9 text-right font-mono text-etiqueta text-black/45">{c.pct}%</span>
            </div>
            <div className="mt-0.5 font-mono text-etiqueta text-black/40">
              {formatCurrency(c.ejecutado)} de {formatCurrency(c.presupuestado)}
            </div>
          </div>
        );
      })}
    </div>
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

function NuevoGastoModal({ periodo, gasto, onClose, onSaved }: { periodo: string; gasto?: Gasto; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!gasto;
  const [categoria, setCategoria] = useState<CategoriaGasto>(gasto?.categoria ?? "mantenimiento");
  const [descripcion, setDescripcion] = useState(gasto?.descripcion ?? "");
  const [proveedor, setProveedor] = useState(gasto?.proveedor ?? "");
  const [noFactura, setNoFactura] = useState(gasto?.no_factura ?? "");
  const [monto, setMonto] = useState(gasto ? String(Number(gasto.monto)) : "");
  const [fecha, setFecha] = useState(gasto ? new Date(gasto.fecha).toISOString().slice(0, 10) : `${periodo}-01`);
  const [metodo, setMetodo] = useState(gasto?.metodo ?? "transferencia");
  const [idItem, setIdItem] = useState(gasto?.id_item ?? "");
  const [items, setItems] = useState<ItemPresupuesto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getItemsPresupuesto().then((r) => setItems(r.filter((i) => i.activo))).catch(() => {}); }, []);
  const itemsCat = items.filter((i) => i.categoria === categoria);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: NuevoGastoPayload = {
        categoria,
        descripcion: descripcion.trim(),
        proveedor: proveedor.trim() || undefined,
        no_factura: noFactura.trim() || undefined,
        monto: Number(monto || 0),
        fecha,
        metodo,
        id_item: idItem || null,
      };
      if (isEdit) await updateGasto(gasto!.id, payload);
      else await createGasto(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Editar gasto" : "Nuevo gasto"} onClose={onClose} width="max-w-lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Categoría *</span>
            <select value={categoria} onChange={(e) => { setCategoria(e.target.value as CategoriaGasto); setIdItem(""); }} className={`${inputCls} mt-1`}>
              {CATS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Subcategoría {itemsCat.length === 0 && <span className="text-black/30 font-normal">(sin ítems)</span>}</span>
            <select value={idItem} onChange={(e) => setIdItem(e.target.value)} disabled={itemsCat.length === 0} className={`${inputCls} mt-1 disabled:bg-black/5`}>
              <option value="">— Sin subcategoría —</option>
              {itemsCat.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Fecha *</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={`${inputCls} mt-1`} />
          </label>
          <label className="col-span-2 block">
            <span className={labelCls}>Descripción *</span>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>Proveedor / beneficiario</span>
            <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>No. factura / recibo</span>
            <input value={noFactura} onChange={(e) => setNoFactura(e.target.value)} className={`${inputCls} mt-1 font-mono`} />
          </label>
          <label className="block">
            <span className={labelCls}>Monto (USD) *</span>
            <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required className={`${inputCls} mt-1 font-mono`} />
          </label>
          <label className="block">
            <span className={labelCls}>Método de pago</span>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={`${inputCls} mt-1`}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar gasto"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function mesAnterior(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

function PresupuestoModal({ periodo, onClose, onSaved }: { periodo: string; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<PresupuestoItem[]>([]);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [descs, setDescs] = useState<Record<string, string>>({});
  const [origen, setOrigen] = useState(mesAnterior(periodo));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function cargar() {
    setLoading(true);
    getPresupuesto(periodo)
      .then((its) => {
        setItems(its);
        const m: Record<string, string> = {};
        const d: Record<string, string> = {};
        its.forEach((i) => {
          m[i.id_item] = Number(i.monto) ? String(Number(i.monto)) : "";
          // Solo mostramos texto si hay una descripción personalizada distinta del nombre.
          d[i.id_item] = i.descripcion && i.descripcion !== i.nombre ? i.descripcion : "";
        });
        setMontos(m);
        setDescs(d);
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => cargar(), [periodo]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      for (const it of items) {
        await setPresupuesto(periodo, it.id_item, Number(montos[it.id_item] || 0), descs[it.id_item]);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function copiar() {
    setMsg(null);
    try {
      const r = await copiarPresupuesto(origen, periodo);
      setMsg(`Copiado de ${origen}: ${r.creados} creado(s), ${r.actualizados} actualizado(s).`);
      cargar();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error al copiar");
    }
  }

  // Agrupa los items por categoría.
  const porCat = CATS.map((c) => ({ cat: c, items: items.filter((i) => i.categoria === c.id) })).filter((g) => g.items.length > 0);

  return (
    <Modal title={`Presupuesto · ${periodo}`} onClose={onClose} width="max-w-lg">
      {loading ? (
        <div className="py-6 text-center text-base text-black/40">Cargando…</div>
      ) : (
        <form onSubmit={guardar} className="space-y-3">
          {/* Copiar de otro mes */}
          <div className="flex items-center gap-2 rounded-md border-[0.5px] border-black/15 bg-surface p-2.5">
            <span className="text-base text-black/55">Generar desde otro mes:</span>
            <input type="month" value={origen} onChange={(e) => setOrigen(e.target.value)} className={`${inputCls} w-40 py-1`} />
            <Button type="button" variant="secondary" onClick={copiar}>Copiar</Button>
          </div>
          {msg && <div className="text-base text-estado-pagado">{msg}</div>}

          {items.length === 0 ? (
            <p className="py-4 text-center text-base text-black/45">
              No hay items de presupuesto. Créalos en Configuración → Items de presupuesto.
            </p>
          ) : (
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {/* Encabezado de columnas para dejar claro qué va en cada casilla */}
              <div className="flex items-center gap-2 border-b-[0.5px] border-black/10 pb-1 text-etiqueta uppercase tracking-wide text-black/40">
                <span className="w-40">Item</span>
                <span className="flex-1">Descripción (opcional)</span>
                <span className="w-28 text-right">Monto (USD)</span>
              </div>
              {porCat.map((g) => (
                <div key={g.cat.id}>
                  <div className="mb-1 flex items-center gap-2 text-etiqueta uppercase tracking-wide text-black/45">
                    <span className="h-2 w-2 rounded-full" style={{ background: g.cat.color }} /> {g.cat.label}
                  </div>
                  {g.items.map((it) => (
                    <div key={it.id_item} className="mb-1.5 flex items-center gap-2">
                      <span className="w-40 truncate text-base" title={it.nombre}>
                        {it.nombre}
                      </span>
                      <input
                        value={descs[it.id_item] ?? ""}
                        onChange={(e) => setDescs((d) => ({ ...d, [it.id_item]: e.target.value }))}
                        placeholder="Descripción (opcional)"
                        title={`Descripción de este mes para «${it.nombre}»`}
                        className={`${inputCls} flex-1 py-1`}
                      />
                      <div className="relative w-28">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-black/40">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={montos[it.id_item] ?? ""}
                          onChange={(e) => setMontos((m) => ({ ...m, [it.id_item]: e.target.value }))}
                          placeholder="0.00"
                          className={`${inputCls} w-28 py-1 pl-5 text-right font-mono`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t-[0.5px] border-black/10 pt-3">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || items.length === 0}>{saving ? "Guardando…" : "Guardar presupuesto"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
