import { useEffect, useState } from "react";
import { IconPlus, IconPencil, IconTrash, IconCategory2, IconCoin } from "@tabler/icons-react";
import {
  getEstados,
  createEstado,
  updateEstado,
  deleteEstado,
  getCuotas,
  createCuota,
  updateCuota,
  type EstadoUnidad,
  type Cuota,
  type CuotaPayload,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import { inputCls, labelCls } from "../../components/ui/form";
import { formatCurrency } from "../../utils/formatters";
import ProyectoTab from "./ProyectoTab";
import CatalogoTab from "./CatalogoTab";
import ItemsPresupuestoTab from "./ItemsPresupuestoTab";
import EmailTab from "./EmailTab";
import WhatsappTab from "./WhatsappTab";
import AccesosTab from "./AccesosTab";
import UsuariosTab from "./UsuariosTab";
import { useAuth } from "../../stores/authStore";
import {
  getBloques, createBloque, updateBloque, deleteBloque,
  getCalles, createCalle, updateCalle, deleteCalle,
  getPisos, createPiso, updatePiso, deletePiso,
  getBancos, createBanco, updateBanco, deleteBanco,
} from "../../api/client";

type Tab = "proyecto" | "estados" | "tarifas" | "items" | "bloques" | "calles" | "pisos" | "bancos" | "email" | "whatsapp" | "accesos" | "usuarios";

export default function Configuracion() {
  const esSuper = useAuth((s) => s.user?.rol) === "superadmin";
  const [tab, setTab] = useState<Tab>("tarifas");
  const [estados, setEstados] = useState<EstadoUnidad[]>([]);
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([getEstados(), getCuotas()])
      .then(([e, c]) => {
        setEstados(e);
        setCuotas(c);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Configuración</h1>
        <p className="text-base text-black/50">
          Estados de unidad y tarifas — todo administrable, montos en dólares (USD)
        </p>
      </div>

      <div className="flex gap-1 border-b-[0.5px] border-black/15">
        <TabBtn active={tab === "proyecto"} onClick={() => setTab("proyecto")}>
          Proyecto
        </TabBtn>
        <TabBtn active={tab === "tarifas"} onClick={() => setTab("tarifas")}>
          Tarifas
        </TabBtn>
        <TabBtn active={tab === "estados"} onClick={() => setTab("estados")}>
          Estados de unidad
        </TabBtn>
        <TabBtn active={tab === "items"} onClick={() => setTab("items")}>
          Items presupuesto
        </TabBtn>
        <TabBtn active={tab === "bloques"} onClick={() => setTab("bloques")}>
          Bloques
        </TabBtn>
        <TabBtn active={tab === "calles"} onClick={() => setTab("calles")}>
          Calles
        </TabBtn>
        <TabBtn active={tab === "pisos"} onClick={() => setTab("pisos")}>
          Pisos
        </TabBtn>
        <TabBtn active={tab === "bancos"} onClick={() => setTab("bancos")}>
          Bancos
        </TabBtn>
        <TabBtn active={tab === "accesos"} onClick={() => setTab("accesos")}>
          Accesos
        </TabBtn>
        {esSuper && (
          <TabBtn active={tab === "usuarios"} onClick={() => setTab("usuarios")}>
            Usuarios
          </TabBtn>
        )}
        <TabBtn active={tab === "email"} onClick={() => setTab("email")}>
          Email
        </TabBtn>
        <TabBtn active={tab === "whatsapp"} onClick={() => setTab("whatsapp")}>
          WhatsApp
        </TabBtn>
      </div>

      {tab === "usuarios" ? (
        <UsuariosTab />
      ) : tab === "accesos" ? (
        <AccesosTab />
      ) : tab === "email" ? (
        <EmailTab />
      ) : tab === "whatsapp" ? (
        <WhatsappTab />
      ) : tab === "proyecto" ? (
        <ProyectoTab />
      ) : tab === "items" ? (
        <ItemsPresupuestoTab />
      ) : tab === "bloques" ? (
        <CatalogoTab key="bloques" singular="bloque" getItems={getBloques} createItem={createBloque} updateItem={updateBloque} deleteItem={deleteBloque} />
      ) : tab === "calles" ? (
        <CatalogoTab key="calles" singular="calle" getItems={getCalles} createItem={createCalle} updateItem={updateCalle} deleteItem={deleteCalle} />
      ) : tab === "pisos" ? (
        <CatalogoTab key="pisos" singular="piso" getItems={getPisos} createItem={createPiso} updateItem={updatePiso} deleteItem={deletePiso} />
      ) : tab === "bancos" ? (
        <CatalogoTab key="bancos" singular="banco" getItems={getBancos} createItem={createBanco} updateItem={updateBanco} deleteItem={deleteBanco} />
      ) : loading ? (
        <div className="py-8 text-center text-base text-black/40">Cargando…</div>
      ) : tab === "tarifas" ? (
        <TarifasTab cuotas={cuotas} estados={estados} onChange={load} />
      ) : (
        <EstadosTab estados={estados} onChange={load} />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-[0.5px] border-b-2 px-3 py-2 text-base transition-colors ${
        active
          ? "border-sidebar-accent font-medium text-ink"
          : "border-transparent text-black/45 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* ================================ TARIFAS ================================ */

function TarifasTab({
  cuotas,
  estados,
  onChange,
}: {
  cuotas: Cuota[];
  estados: EstadoUnidad[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Cuota | "new" | null>(null);

  return (
    <Panel
      action={
        <Button onClick={() => setEditing("new")}>
          <IconPlus size={16} /> Nueva tarifa
        </Button>
      }
    >
      {cuotas.length === 0 ? (
        <EmptyState icon={<IconCoin size={28} stroke={1.5} />} title="Sin tarifas configuradas" />
      ) : (
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">Concepto</th>
              <th className="py-1.5 font-medium">Aplica a</th>
              <th className="py-1.5 font-medium">Tipo</th>
              <th className="py-1.5 text-right font-medium">Monto</th>
              <th className="py-1.5 font-medium">Periodicidad</th>
              <th className="py-1.5 font-medium">Estado</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {cuotas.map((c) => (
              <tr key={c.id} className="border-b-[0.5px] border-black/5">
                <td className="py-2 font-medium">{c.concepto}</td>
                <td className="py-2 text-black/60">{c.estados_unidad?.nombre ?? "Todas"}</td>
                <td className="py-2">
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-etiqueta uppercase text-black/55">
                    {c.tipo}
                  </span>
                </td>
                <td className="py-2 text-right font-mono">
                  {c.tipo === "variable" ? "—" : formatCurrency(Number(c.monto))}
                </td>
                <td className="py-2 text-black/60">{c.periodicidad}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${
                      c.activo ? "bg-estado-pagado/12 text-estado-pagado" : "bg-black/5 text-black/45"
                    }`}
                  >
                    {c.activo ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => setEditing(c)}
                    className="text-black/40 hover:text-ink"
                    aria-label="Editar"
                  >
                    <IconPencil size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <TarifaModal
          cuota={editing === "new" ? null : editing}
          estados={estados}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
        />
      )}
    </Panel>
  );
}

const PERIODICIDADES = ["mensual", "bimestral", "trimestral", "anual", "unica"];

function TarifaModal({
  cuota,
  estados,
  onClose,
  onSaved,
}: {
  cuota: Cuota | null;
  estados: EstadoUnidad[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [concepto, setConcepto] = useState(cuota?.concepto ?? "");
  const [monto, setMonto] = useState(cuota ? String(cuota.monto) : "");
  const [tipo, setTipo] = useState<"fijo" | "variable">(cuota?.tipo ?? "fijo");
  const [idEstado, setIdEstado] = useState<string>(cuota?.id_estado_unidad ?? "");
  const [periodicidad, setPeriodicidad] = useState(cuota?.periodicidad ?? "mensual");
  const [activo, setActivo] = useState(cuota?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: CuotaPayload = {
        concepto: concepto.trim(),
        monto: tipo === "variable" ? 0 : Number(monto || 0),
        tipo,
        id_estado_unidad: idEstado || null,
        periodicidad,
        aplica_auto: true,
      };
      if (cuota) await updateCuota(cuota.id, { ...payload, activo });
      else await createCuota(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={cuota ? "Editar tarifa" : "Nueva tarifa"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <label className="block">
          <span className={labelCls}>Concepto *</span>
          <input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Mantenimiento, Agua…"
            required
            className={`${inputCls} mt-1`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "fijo" | "variable")} className={`${inputCls} mt-1`}>
              <option value="fijo">Fijo</option>
              <option value="variable">Variable (se captura al facturar)</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Monto (USD){tipo === "variable" ? " — n/a" : ""}</span>
            <input
              type="number"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              disabled={tipo === "variable"}
              className={`${inputCls} mt-1 font-mono disabled:bg-black/5`}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Aplica a</span>
            <select value={idEstado} onChange={(e) => setIdEstado(e.target.value)} className={`${inputCls} mt-1`}>
              <option value="">Todas las unidades</option>
              {estados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Periodicidad</span>
            <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)} className={`${inputCls} mt-1`}>
              {PERIODICIDADES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {cuota && (
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activa
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ============================ ESTADOS DE UNIDAD ============================ */

function EstadosTab({ estados, onChange }: { estados: EstadoUnidad[]; onChange: () => void }) {
  const [editing, setEditing] = useState<EstadoUnidad | "new" | null>(null);

  async function desactivar(e: EstadoUnidad) {
    if (!confirm(`¿Desactivar el estado "${e.nombre}"?`)) return;
    await deleteEstado(e.id);
    onChange();
  }

  return (
    <Panel
      action={
        <Button onClick={() => setEditing("new")}>
          <IconPlus size={16} /> Nuevo estado
        </Button>
      }
    >
      {estados.length === 0 ? (
        <EmptyState icon={<IconCategory2 size={28} stroke={1.5} />} title="Sin estados configurados" />
      ) : (
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">Orden</th>
              <th className="py-1.5 font-medium">Nombre</th>
              <th className="py-1.5 font-medium">Estado</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {estados.map((e) => (
              <tr key={e.id} className="border-b-[0.5px] border-black/5">
                <td className="py-2 font-mono text-black/55">{e.orden}</td>
                <td className="py-2 font-medium">{e.nombre}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${
                      e.activo ? "bg-estado-pagado/12 text-estado-pagado" : "bg-black/5 text-black/45"
                    }`}
                  >
                    {e.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditing(e)} className="text-black/40 hover:text-ink" aria-label="Editar">
                      <IconPencil size={16} />
                    </button>
                    {e.activo && (
                      <button
                        onClick={() => desactivar(e)}
                        className="text-black/40 hover:text-estado-atrasado"
                        aria-label="Desactivar"
                      >
                        <IconTrash size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <EstadoModal
          estado={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
        />
      )}
    </Panel>
  );
}

function EstadoModal({
  estado,
  onClose,
  onSaved,
}: {
  estado: EstadoUnidad | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(estado?.nombre ?? "");
  const [orden, setOrden] = useState(String(estado?.orden ?? 0));
  const [activo, setActivo] = useState(estado?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (estado) await updateEstado(estado.id, { nombre: nombre.trim(), orden: Number(orden), activo });
      else await createEstado({ nombre: nombre.trim(), orden: Number(orden) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={estado ? "Editar estado" : "Nuevo estado"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          <label className="col-span-2 block">
            <span className={labelCls}>Nombre *</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>Orden</span>
            <input type="number" value={orden} onChange={(e) => setOrden(e.target.value)} className={`${inputCls} mt-1 font-mono`} />
          </label>
        </div>
        {estado && (
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
