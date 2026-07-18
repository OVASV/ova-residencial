import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconUserPlus,
  IconPlus,
  IconSearch,
  IconUsers,
  IconBuildingEstate,
  IconTag,
  IconReportMoney,
  IconPrinter,
  IconMap2,
  IconPencil,
  IconCircleOff,
  IconRestore,
  IconUserShare,
} from "@tabler/icons-react";
import {
  getPropietarios,
  getUnidades,
  createUnidad,
  updateUnidad,
  updatePropietario,
  deletePropietario,
  getEstados,
  getPaises,
  getBloques,
  getCalles,
  getPisos,
  asignarEstadoUnidad,
  asignarPropietario,
  getHistorialUnidad,
  getHistorialEstadoUnidad,
  type Propietario,
  type Unidad,
  type EstadoUnidad,
  type Pais,
  type Catalogo,
  type HistorialItem,
  type HistorialEstadoItem,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import { inputCls, labelCls } from "../../components/ui/form";
import { parseCoords, formatDate } from "../../utils/formatters";

type Tab = "propietarios" | "unidades";

export default function Residentes() {
  const [tab, setTab] = useState<Tab>("unidades");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Unidades y residentes</h1>
          <p className="text-base text-black/50">Propiedades del complejo y sus propietarios</p>
        </div>
        <div className="flex gap-2">
          <Link to="/residentes/mapa-editar">
            <Button variant="secondary">
              <IconMap2 size={16} /> Mapa
            </Button>
          </Link>
          <Link to="/residentes/nuevo">
            <Button>
              <IconUserPlus size={16} /> Nuevo propietario
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-1 border-b-[0.5px] border-black/15">
        <TabBtn active={tab === "unidades"} onClick={() => setTab("unidades")}>
          Unidades
        </TabBtn>
        <TabBtn active={tab === "propietarios"} onClick={() => setTab("propietarios")}>
          Propietarios
        </TabBtn>
      </div>

      {tab === "unidades" ? <UnidadesTab /> : <PropietariosTab />}
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

function PropietariosTab() {
  const [data, setData] = useState<Propietario[]>([]);
  const [paises, setPaises] = useState<Pais[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Propietario | null>(null);

  function load() {
    setLoading(true);
    getPropietarios()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    getPaises().then(setPaises).catch(() => {});
  }, []);

  const filtered = q.trim()
    ? data.filter((p) => {
        const t = q.toLowerCase();
        return (
          p.nombre?.toLowerCase().includes(t) ||
          p.apellido?.toLowerCase().includes(t) ||
          p.dpi_nit?.toLowerCase().includes(t) ||
          p.email?.toLowerCase().includes(t) ||
          p.telefono?.toLowerCase().includes(t) ||
          p.paises?.nombre?.toLowerCase().includes(t) ||
          p.historial_propietarios.some((h) => h.id_unidad.toLowerCase().includes(t))
        );
      })
    : data;

  return (
    <Panel
      action={
        <div className="relative">
          <IconSearch size={15} className="absolute left-2 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nombre, DPI, email, teléfono, lote…"
            className={`${inputCls} w-72 py-1.5 pl-7`}
          />
        </div>
      }
    >
      {error && <div className="mb-3 text-base text-estado-atrasado">{error}</div>}
      {loading ? (
        <div className="py-8 text-center text-base text-black/40">Cargando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={28} stroke={1.5} />}
          title="Sin propietarios registrados"
          hint="Crea el primero con «Nuevo propietario»"
        />
      ) : (
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">Propietario</th>
              <th className="py-1.5 font-medium">DPI / NIT</th>
              <th className="py-1.5 font-medium">Contacto</th>
              <th className="py-1.5 font-medium">País</th>
              <th className="py-1.5 font-medium">Unidades</th>
              <th className="py-1.5 font-medium">Estado</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b-[0.5px] border-black/5">
                <td className="py-2 font-medium">
                  {p.apellido}, {p.nombre}
                </td>
                <td className="py-2 font-mono text-black/70">{p.dpi_nit ?? "—"}</td>
                <td className="py-2 text-black/60">
                  {p.email ?? "—"}
                  {p.telefono ? ` · ${p.telefono}` : ""}
                </td>
                <td className="py-2 text-black/60">{p.paises?.nombre ?? "—"}</td>
                <td className="py-2 font-mono">
                  {p.historial_propietarios.map((h) => h.unidades?.numero_propiedad ?? h.id_unidad).join(", ") || "—"}
                </td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${
                      p.activo
                        ? "bg-estado-pagado/12 text-estado-pagado"
                        : "bg-black/5 text-black/45"
                    }`}
                  >
                    {p.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditando(p)}
                      title="Editar propietario"
                      className="text-black/40 hover:text-sidebar-accent"
                      aria-label="Editar propietario"
                    >
                      <IconPencil size={16} />
                    </button>
                    {p.activo ? (
                      <button
                        onClick={async () => {
                          if (confirm(`¿Desactivar a ${p.nombre} ${p.apellido}?`)) {
                            await deletePropietario(p.id);
                            load();
                          }
                        }}
                        title="Desactivar"
                        className="text-black/40 hover:text-estado-atrasado"
                        aria-label="Desactivar propietario"
                      >
                        <IconCircleOff size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          await updatePropietario(p.id, { activo: true });
                          load();
                        }}
                        title="Reactivar"
                        className="text-black/40 hover:text-estado-pagado"
                        aria-label="Reactivar propietario"
                      >
                        <IconRestore size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editando && (
        <EditarPropietarioModal
          propietario={editando}
          paises={paises}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            load();
          }}
        />
      )}
    </Panel>
  );
}

function EditarPropietarioModal({
  propietario,
  paises,
  onClose,
  onSaved,
}: {
  propietario: Propietario;
  paises: Pais[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(propietario.nombre);
  const [apellido, setApellido] = useState(propietario.apellido);
  const [dpiNit, setDpiNit] = useState(propietario.dpi_nit ?? "");
  const [telefono, setTelefono] = useState(propietario.telefono ?? "");
  const [email, setEmail] = useState(propietario.email ?? "");
  const [direccion, setDireccion] = useState(propietario.direccion ?? "");
  const [idPais, setIdPais] = useState<number | "">(propietario.id_pais ?? "");
  const [activo, setActivo] = useState(propietario.activo);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updatePropietario(propietario.id, {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        dpi_nit: dpiNit.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        direccion: direccion.trim() || null,
        id_pais: idPais === "" ? null : Number(idPais),
        activo,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar propietario" onClose={onClose} width="max-w-lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Nombre *</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>Apellido *</span>
            <input value={apellido} onChange={(e) => setApellido(e.target.value)} required className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>DPI / NIT</span>
            <input value={dpiNit} onChange={(e) => setDpiNit(e.target.value)} className={`${inputCls} mt-1 font-mono`} />
          </label>
          <label className="block">
            <span className={labelCls}>Teléfono</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>País</span>
            <select value={idPais} onChange={(e) => setIdPais(e.target.value === "" ? "" : Number(e.target.value))} className={`${inputCls} mt-1`}>
              <option value="">—</option>
              {paises.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block">
            <span className={labelCls}>Dirección</span>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-base">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Propietario activo
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// Paleta estable para colorear las categorías (no se guardan colores en BD).
const CATEGORIA_PALETTE = ["#1D9E75", "#4A90D9", "#EF9F27", "#7B5EA7", "#E24B4A", "#0EA5A0", "#D8722D", "#5B7083"];

// Asigna un color a cada estado/categoría según su orden (estable y reproducible).
function mapaColoresCategoria(estados: EstadoUnidad[]): Record<string, string> {
  const ordenados = [...estados].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  const map: Record<string, string> = {};
  ordenados.forEach((e, i) => { map[e.id] = CATEGORIA_PALETTE[i % CATEGORIA_PALETTE.length]; });
  return map;
}

function UnidadesTab() {
  const [data, setData] = useState<Unidad[]>([]);
  const [estados, setEstados] = useState<EstadoUnidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bloques, setBloques] = useState<Catalogo[]>([]);
  const [calles, setCalles] = useState<Catalogo[]>([]);
  const [pisos, setPisos] = useState<Catalogo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [estadoDe, setEstadoDe] = useState<Unidad | null>(null);
  const [editandoU, setEditandoU] = useState<Unidad | null>(null);
  const [gestionarU, setGestionarU] = useState<Unidad | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const navigate = useNavigate();

  function load() {
    setLoading(true);
    Promise.all([getUnidades(), getEstados(), getBloques(), getCalles(), getPisos()])
      .then(([u, e, b, c, p]) => {
        setData(u);
        setEstados(e.filter((x) => x.activo));
        setBloques(b.filter((x) => x.activo));
        setCalles(c.filter((x) => x.activo));
        setPisos(p.filter((x) => x.activo));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), []);

  const colorCat = mapaColoresCategoria(estados);
  const colOf = (u: Unidad) => (u.estado_actual ? colorCat[u.estado_actual.id] ?? "#888888" : "#888888");

  const q = busqueda.toLowerCase();
  const filtradas = q
    ? data.filter((u) =>
        (u.numero_propiedad ?? "").toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        (u.bloque ?? "").toLowerCase().includes(q) ||
        (u.calle ?? "").toLowerCase().includes(q) ||
        (u.estado_actual?.nombre ?? "").toLowerCase().includes(q) ||
        (u.propietario_actual ? `${u.propietario_actual.nombre} ${u.propietario_actual.apellido}`.toLowerCase().includes(q) : false)
      )
    : data;

  return (
    <Panel
      action={
        <div className="flex items-center gap-2">
          <div className="relative">
            <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black/30" />
            <input
              type="text"
              placeholder="Buscar unidad…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="rounded-md border-[0.5px] border-black/15 bg-white py-1.5 pl-8 pr-3 text-base outline-none focus:border-sidebar-accent focus:ring-1 focus:ring-sidebar-accent/30"
            />
          </div>
          <Button variant="secondary" onClick={() => setShowForm(true)}>
            <IconPlus size={16} /> Nueva unidad
          </Button>
        </div>
      }
    >
      {error && <div className="mb-3 text-base text-estado-atrasado">{error}</div>}
      {loading ? (
        <div className="py-8 text-center text-base text-black/40">Cargando…</div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<IconBuildingEstate size={28} stroke={1.5} />}
          title="Sin unidades registradas"
          hint="Agrega la primera con «Nueva unidad»"
        />
      ) : (
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 text-center font-medium">N° propiedad</th>
              <th className="py-1.5 font-medium">Código</th>
              <th className="py-1.5 font-medium">Bloque</th>
              <th className="py-1.5 font-medium">Calle</th>
              <th className="py-1.5 font-medium">Piso</th>
              <th className="py-1.5 text-right font-medium">Área m²</th>
              <th className="py-1.5 font-medium">Categoría</th>
              <th className="py-1.5 font-medium">Propietario actual</th>
              <th className="py-1.5 font-medium">Activa</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((u) => (
              <tr
                key={u.id}
                className="border-b-[0.5px] border-black/5"
                style={u.estado_actual ? { backgroundColor: colOf(u) + "12", boxShadow: `inset 3px 0 0 ${colOf(u)}` } : undefined}
              >
                <td className="py-2 text-center font-medium">{u.numero_propiedad ?? <span className="text-estado-pendiente">— falta</span>}</td>
                <td className="py-2 font-mono text-black/45">{u.id}</td>
                <td className="py-2">{u.bloque ?? "—"}</td>
                <td className="py-2 text-black/70">{u.calle ?? "—"}</td>
                <td className="py-2">{u.piso ?? "—"}</td>
                <td className="py-2 text-right font-mono">{u.area_m2 ?? "—"}</td>
                <td className="py-2">
                  {u.estado_actual ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase"
                      style={{ backgroundColor: colOf(u) + "26", color: colOf(u) }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: colOf(u) }} />
                      {u.estado_actual.nombre}
                    </span>
                  ) : (
                    <span className="text-black/35">Sin categoría</span>
                  )}
                </td>
                <td className="py-2">
                  {u.propietario_actual ? (
                    `${u.propietario_actual.nombre} ${u.propietario_actual.apellido}`
                  ) : (
                    <span className="text-black/35">Disponible</span>
                  )}
                </td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${
                      u.activo ? "bg-estado-pagado/12 text-estado-pagado" : "bg-black/5 text-black/45"
                    }`}
                  >
                    {u.activo ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setGestionarU(u)}
                      title="Propietario e historial"
                      className="text-black/40 hover:text-sidebar-accent"
                      aria-label="Propietario e historial"
                    >
                      <IconUserShare size={16} />
                    </button>
                    <button
                      onClick={() => navigate(`/pagos/estado-cuenta/${u.id}`)}
                      title="Estado de cuenta"
                      className="text-black/40 hover:text-sidebar-accent"
                      aria-label="Estado de cuenta"
                    >
                      <IconReportMoney size={16} />
                    </button>
                    <a
                      href={`/pagos/estado-cuenta/${encodeURIComponent(u.id)}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Imprimir estado de cuenta"
                      className="text-black/40 hover:text-sidebar-accent"
                    >
                      <IconPrinter size={16} />
                    </a>
                    <button
                      onClick={() => setEstadoDe(u)}
                      title="Asignar categoría"
                      className="text-black/40 hover:text-sidebar-accent"
                      aria-label="Asignar categoría"
                    >
                      <IconTag size={16} />
                    </button>
                    <button
                      onClick={() => setEditandoU(u)}
                      title="Editar unidad"
                      className="text-black/40 hover:text-sidebar-accent"
                      aria-label="Editar unidad"
                    >
                      <IconPencil size={16} />
                    </button>
                    {u.activo ? (
                      <button
                        onClick={async () => {
                          if (confirm(`¿Desactivar la unidad ${u.id}?`)) {
                            await updateUnidad(u.id, { activo: false });
                            load();
                          }
                        }}
                        title="Desactivar"
                        className="text-black/40 hover:text-estado-atrasado"
                        aria-label="Desactivar unidad"
                      >
                        <IconCircleOff size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          await updateUnidad(u.id, { activo: true });
                          load();
                        }}
                        title="Reactivar"
                        className="text-black/40 hover:text-estado-pagado"
                        aria-label="Reactivar unidad"
                      >
                        <IconRestore size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <NuevaUnidadModal
          bloques={bloques}
          calles={calles}
          pisos={pisos}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {estadoDe && (
        <AsignarEstadoModal
          unidad={estadoDe}
          estados={estados}
          onClose={() => setEstadoDe(null)}
          onSaved={() => {
            setEstadoDe(null);
            load();
          }}
        />
      )}

      {editandoU && (
        <EditarUnidadModal
          unidad={editandoU}
          bloques={bloques}
          calles={calles}
          pisos={pisos}
          onClose={() => setEditandoU(null)}
          onSaved={() => {
            setEditandoU(null);
            load();
          }}
        />
      )}

      {gestionarU && (
        <GestionarUnidadModal
          unidad={gestionarU}
          onClose={() => setGestionarU(null)}
          onChanged={load}
        />
      )}
    </Panel>
  );
}

const MOTIVOS_ASIG = ["compra", "herencia", "donacion", "traspaso", "otro"];

// Asignar/transferir propietario + ver historial de propietarios y de estado del inmueble.
function GestionarUnidadModal({
  unidad,
  onClose,
  onChanged,
}: {
  unidad: Unidad;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"asignar" | "propietarios" | "estado">("asignar");
  const [propietarios, setPropietarios] = useState<Propietario[]>([]);
  const [histProp, setHistProp] = useState<HistorialItem[]>([]);
  const [histEstado, setHistEstado] = useState<HistorialEstadoItem[]>([]);
  const [actual, setActual] = useState<Unidad["propietario_actual"]>(unidad.propietario_actual);

  const [idProp, setIdProp] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState("compra");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function recargar() {
    Promise.all([getHistorialUnidad(unidad.id), getHistorialEstadoUnidad(unidad.id)]).then(([hp, he]) => {
      setHistProp(hp);
      setHistEstado(he);
      const abierto = hp.find((h) => !h.fecha_fin);
      setActual(abierto ? { id: abierto.propietarios.id, nombre: abierto.propietarios.nombre, apellido: abierto.propietarios.apellido, desde: abierto.fecha_inicio } : null);
    });
  }

  useEffect(() => {
    getPropietarios().then((ps) => setPropietarios(ps.filter((p) => p.activo)));
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidad.id]);

  async function asignar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await asignarPropietario(unidad.id, { id_propietario: idProp, fecha_inicio: fecha, motivo });
      setIdProp("");
      recargar();
      onChanged();
      setTab("propietarios");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al asignar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Unidad ${unidad.numero_propiedad ?? unidad.id} · propietario`} onClose={onClose} width="max-w-2xl">
      <div className="mb-3 rounded-md border-[0.5px] border-black/10 bg-surface px-3 py-2 text-base">
        Propietario actual:{" "}
        {actual ? (
          <span className="font-medium">{actual.nombre} {actual.apellido}</span>
        ) : (
          <span className="text-black/45">sin propietario (disponible)</span>
        )}
      </div>

      <div className="mb-4 flex gap-1 border-b-[0.5px] border-black/15">
        <ModalTab active={tab === "asignar"} onClick={() => setTab("asignar")}>{actual ? "Transferir" : "Asignar"}</ModalTab>
        <ModalTab active={tab === "propietarios"} onClick={() => setTab("propietarios")}>Historial propietarios</ModalTab>
        <ModalTab active={tab === "estado"} onClick={() => setTab("estado")}>Historial estado</ModalTab>
      </div>

      {tab === "asignar" && (
        <form onSubmit={asignar} className="space-y-3">
          {error && <div className="text-base text-estado-atrasado">{error}</div>}
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-3 block">
              <span className={labelCls}>Propietario *</span>
              <select value={idProp} onChange={(e) => setIdProp(e.target.value)} required className={`${inputCls} mt-1`}>
                <option value="">Seleccionar…</option>
                {propietarios.map((p) => <option key={p.id} value={p.id}>{p.apellido}, {p.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Vigente desde *</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={`${inputCls} mt-1`} />
            </label>
            <label className="col-span-2 block">
              <span className={labelCls}>Motivo</span>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${inputCls} mt-1`}>
                {MOTIVOS_ASIG.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </label>
          </div>
          {actual && (
            <p className="text-etiqueta uppercase tracking-wide text-black/40">
              Al transferir, el propietario actual queda como histórico desde la fecha indicada.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button>
            <Button type="submit" disabled={saving || !idProp}>{saving ? "Guardando…" : actual ? "Transferir propiedad" : "Asignar propietario"}</Button>
          </div>
        </form>
      )}

      {tab === "propietarios" && (
        <HistTable
          vacio="Sin propietarios registrados"
          cols={["Propietario", "Desde", "Hasta", "Motivo"]}
          filas={histProp.map((h) => [
            `${h.propietarios.nombre} ${h.propietarios.apellido}`,
            formatDate(h.fecha_inicio),
            h.fecha_fin ? formatDate(h.fecha_fin) : "ACTUAL",
            h.motivo ?? "—",
          ])}
        />
      )}

      {tab === "estado" && (
        <HistTable
          vacio="Sin cambios de estado registrados"
          cols={["Estado / categoría", "Desde", "Hasta"]}
          filas={histEstado.map((h) => [
            h.estados_unidad.nombre,
            formatDate(h.fecha_inicio),
            h.fecha_fin ? formatDate(h.fecha_fin) : "ACTUAL",
          ])}
        />
      )}
    </Modal>
  );
}

function ModalTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-[0.5px] border-b-2 px-3 py-1.5 text-base transition-colors ${active ? "border-sidebar-accent font-medium text-ink" : "border-transparent text-black/45 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function HistTable({ cols, filas, vacio }: { cols: string[]; filas: string[][]; vacio: string }) {
  if (filas.length === 0) return <div className="py-6 text-center text-base text-black/40">{vacio}</div>;
  return (
    <table className="w-full text-tabla">
      <thead>
        <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
          {cols.map((c) => <th key={c} className="py-1.5 font-medium">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b-[0.5px] border-black/5">
            {f.map((v, j) => (
              <td key={j} className={`py-2 ${j === 0 ? "font-medium" : "text-black/65"} ${v === "ACTUAL" ? "font-mono text-estado-pagado" : ""}`}>{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EditarUnidadModal({
  unidad,
  bloques,
  calles,
  pisos,
  onClose,
  onSaved,
}: {
  unidad: Unidad;
  bloques: Catalogo[];
  calles: Catalogo[];
  pisos: Catalogo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [numero, setNumero] = useState(unidad.numero_propiedad ?? "");
  const [idBloque, setIdBloque] = useState(unidad.id_bloque ?? "");
  const [idCalle, setIdCalle] = useState(unidad.id_calle ?? "");
  const [idPiso, setIdPiso] = useState(unidad.id_piso ?? "");
  const [area, setArea] = useState(unidad.area_m2 != null ? String(unidad.area_m2) : "");
  const [activo, setActivo] = useState(unidad.activo);
  const [ubic, setUbic] = useState(
    unidad.lat != null && unidad.lng != null ? `${unidad.lat}, ${unidad.lng}` : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const coords = ubic.trim() ? parseCoords(ubic) : null;
  const ubicInvalida = ubic.trim() !== "" && !coords;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!numero.trim()) {
      setError("El número de propiedad es requerido.");
      return;
    }
    if (ubicInvalida) {
      setError("Ubicación inválida. Usa «lat, lng» o pega un link de Google Maps.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateUnidad(unidad.id, {
        numero_propiedad: numero.trim(),
        ...(idBloque ? { id_bloque: idBloque } : {}),
        ...(idCalle ? { id_calle: idCalle } : {}),
        id_piso: idPiso || null,
        area_m2: area ? Number(area) : null,
        activo,
        // Si el campo está vacío se borran las coordenadas; si trae valor válido, se guardan.
        lat: ubic.trim() ? coords?.lat ?? null : null,
        lng: ubic.trim() ? coords?.lng ?? null : null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Editar unidad ${unidad.numero_propiedad ?? unidad.id}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <label className="block">
          <span className={labelCls}>N° de propiedad / unidad *</span>
          <input value={numero} onChange={(e) => setNumero(e.target.value)} required className={`${inputCls} mt-1`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Bloque *</span>
            <select value={idBloque} onChange={(e) => setIdBloque(e.target.value)} required className={`${inputCls} mt-1`}>
              <option value="">Seleccionar…</option>
              {bloques.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Calle *</span>
            <select value={idCalle} onChange={(e) => setIdCalle(e.target.value)} required className={`${inputCls} mt-1`}>
              <option value="">Seleccionar…</option>
              {calles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Área m²</span>
            <input type="number" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} className={`${inputCls} mt-1 font-mono`} />
          </label>
          <label className="block">
            <span className={labelCls}>Piso</span>
            <select value={idPiso} onChange={(e) => setIdPiso(e.target.value)} className={`${inputCls} mt-1`}>
              <option value="">Sin piso</option>
              {pisos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={labelCls}>Ubicación (lat, lng o link de Google Maps)</span>
          <input
            value={ubic}
            onChange={(e) => setUbic(e.target.value)}
            placeholder="14.6349, -90.5069  ·  o pega un link de Google Maps"
            className={`${inputCls} mt-1 font-mono ${ubicInvalida ? "border-estado-atrasado" : ""}`}
          />
          {coords ? (
            <span className="mt-1 block text-etiqueta uppercase tracking-wide text-estado-pagado">
              ✓ lat {coords.lat.toFixed(6)} · lng {coords.lng.toFixed(6)}
            </span>
          ) : (
            <span className="mt-1 block text-etiqueta text-black/40">
              En google.com/maps: clic derecho sobre la propiedad → copia las coordenadas, o copia el link.
            </span>
          )}
        </label>
        <p className="text-etiqueta uppercase tracking-wide text-black/40">
          La categoría se edita con su acción propia (🏷). También puedes ubicarla en el Mapa.
        </p>
        <label className="flex items-center gap-2 text-base">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Unidad activa
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AsignarEstadoModal({
  unidad,
  estados,
  onClose,
  onSaved,
}: {
  unidad: Unidad;
  estados: EstadoUnidad[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [idEstado, setIdEstado] = useState(unidad.estado_actual?.id ?? "");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await asignarEstadoUnidad(unidad.id, { id_estado: idEstado, fecha_inicio: fecha });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al asignar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Categoría de la unidad ${unidad.id}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        {unidad.estado_actual && (
          <p className="text-base text-black/55">
            Actual: <span className="font-medium text-ink">{unidad.estado_actual.nombre}</span>. Al
            cambiarla se registra en el historial desde la fecha indicada.
          </p>
        )}
        <label className="block">
          <span className={labelCls}>Categoría / estado *</span>
          <select
            value={idEstado}
            onChange={(e) => setIdEstado(e.target.value)}
            required
            className={`${inputCls} mt-1`}
          >
            <option value="">Seleccionar…</option>
            {estados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Vigente desde *</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={`${inputCls} mt-1`} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !idEstado}>
            {saving ? "Guardando…" : "Asignar categoría"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function NuevaUnidadModal({
  bloques,
  calles,
  pisos,
  onClose,
  onCreated,
}: {
  bloques: Catalogo[];
  calles: Catalogo[];
  pisos: Catalogo[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [idBloque, setIdBloque] = useState("");
  const [idCalle, setIdCalle] = useState("");
  const [idPiso, setIdPiso] = useState("");
  const [area, setArea] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createUnidad({
        numero_propiedad: numero.trim(),
        id_bloque: idBloque,
        id_calle: idCalle,
        id_piso: idPiso || null,
        area_m2: area ? Number(area) : null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear unidad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nueva unidad" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <p className="text-etiqueta uppercase tracking-wide text-black/40">
          El código interno de la unidad se genera automáticamente.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className={labelCls}>N° de propiedad / unidad *</span>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Casa 12, Lote 5…" required className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>Bloque *</span>
            <select value={idBloque} onChange={(e) => setIdBloque(e.target.value)} required className={`${inputCls} mt-1`}>
              <option value="">Seleccionar…</option>
              {bloques.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Calle *</span>
            <select value={idCalle} onChange={(e) => setIdCalle(e.target.value)} required className={`${inputCls} mt-1`}>
              <option value="">Seleccionar…</option>
              {calles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Área m²</span>
            <input type="number" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className={labelCls}>Piso</span>
            <select value={idPiso} onChange={(e) => setIdPiso(e.target.value)} className={`${inputCls} mt-1`}>
              <option value="">Sin piso</option>
              {pisos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        </div>
        {(bloques.length === 0 || calles.length === 0) && (
          <p className="text-base text-estado-pendiente">
            Define primero los bloques y calles en Configuración.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving || !idBloque || !idCalle}>{saving ? "Guardando…" : "Crear unidad"}</Button>
        </div>
      </form>
    </Modal>
  );
}
