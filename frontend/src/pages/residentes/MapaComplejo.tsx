import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IconSearch, IconX, IconFileText, IconMapPin } from "@tabler/icons-react";
import {
  getMapaUnidades,
  getEstadoCuenta,
  updateUnidadCoords,
  type UnidadMapa,
  type NivelMapa,
  type EstadoCuenta,
  type Cargo,
  type Pago,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import { inputCls } from "../../components/ui/form";
import { formatCurrency, formatDate } from "../../utils/formatters";
import MonoAmount from "../../components/ui/MonoAmount";

const NIVEL: Record<NivelMapa, { color: string; label: string }> = {
  mayor_1000: { color: "#E24B4A", label: "Más de 1,000" },
  "500_1000": { color: "#EF9F27", label: "500 – 1,000" },
  "100_500": { color: "#085041", label: "100 – 500" },
  menor_100: { color: "#888888", label: "Menos de 100" },
  al_dia: { color: "#1D9E75", label: "Al día" },
  a_favor: { color: "#10B981", label: "A favor" },
};

const CENTRO_DEFAULT: [number, number] = [14.6349, -90.5069];
const hasCoords = (u: UnidadMapa) => u.lat != null && u.lng != null;
const toLatLng = (u: UnidadMapa): [number, number] => [Number(u.lat), Number(u.lng)];

const ESTADO_SVG: Record<string, string> = {
  casa: `<path d="M3 12l9-8 9 8" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="5" y="12" width="14" height="9" rx="1" fill="none" stroke="white" stroke-width="2"/><rect x="9" y="15" width="6" height="6" rx="0.5" fill="none" stroke="white" stroke-width="1.5"/>`,
  terreno: `<rect x="3" y="16" width="18" height="2" rx="1" fill="white"/><path d="M5 16 L8 10 L11 14 L15 8 L19 16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  construccion: `<rect x="6" y="10" width="12" height="11" rx="1" fill="none" stroke="white" stroke-width="2"/><path d="M12 3 L12 10" stroke="white" stroke-width="2.2" stroke-linecap="round"/><path d="M7 6 L17 6" stroke="white" stroke-width="2" stroke-linecap="round"/><rect x="9" y="14" width="2" height="3" fill="white" rx="0.3"/><rect x="13" y="14" width="2" height="3" fill="white" rx="0.3"/>`,
  airbnb: `<circle cx="12" cy="8" r="3" fill="none" stroke="white" stroke-width="2"/><path d="M6 21 C6 16 9 13 12 13 C15 13 18 16 18 21" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M4 12 L12 5 L20 12" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
};

function estadoToKey(nombre: string | undefined): string {
  if (!nombre) return "casa";
  const n = nombre.toLowerCase();
  if (n.includes("sin construc") || n.includes("terreno")) return "terreno";
  if (n.includes("en construc")) return "construccion";
  if (n.includes("airbnb")) return "airbnb";
  return "casa";
}

const pin = (color: string, selected = false, estadoNombre?: string) => {
  const size = selected ? 26 : 18;
  const shadow = selected
    ? `box-shadow:0 0 0 4px ${color}59,0 0 0 6px ${color}26,0 2px 6px rgba(0,0,0,.55)`
    : `box-shadow:0 1px 3px rgba(0,0,0,.4)`;
  const svg = ESTADO_SVG[estadoToKey(estadoNombre)] ?? ESTADO_SVG.casa;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;${shadow}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size * 0.6}" height="${size * 0.6}">${svg}</svg></div>`,
  });
};

function FlyTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], 18);
  }, [target, map]);
  return null;
}

// Click on map to place a unit that has no coords yet
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Kardex builder ──
const r2 = (n: number) => Math.round(n * 100) / 100;
interface Mov { fecha: string; concepto: string; cargo: number; abono: number; saldo: number }
interface MesK { periodo: string; saldo_inicial: number; cargos: number; abonos: number; saldo_final: number; movimientos: Mov[] }

function construirKardex(cargos: Cargo[], pagos: Pago[]): MesK[] {
  const meses = new Map<string, { cargos: number; abonos: number; movs: Omit<Mov, "saldo">[] }>();
  const get = (k: string) => {
    let g = meses.get(k);
    if (!g) { g = { cargos: 0, abonos: 0, movs: [] }; meses.set(k, g); }
    return g;
  };
  for (const c of cargos) {
    const fecha = String(c.periodo_mes).slice(0, 10);
    const g = get(fecha.slice(0, 7));
    g.cargos = r2(g.cargos + Number(c.monto));
    g.movs.push({ fecha, concepto: c.concepto, cargo: Number(c.monto), abono: 0 });
  }
  for (const p of pagos) {
    const fecha = String(p.fecha_pago).slice(0, 10);
    const g = get(fecha.slice(0, 7));
    g.abonos = r2(g.abonos + Number(p.monto_total));
    const ref = p.referencia_banco ? ` · ${p.referencia_banco}` : "";
    g.movs.push({ fecha, concepto: `Pago (${p.metodo}${ref})`, cargo: 0, abono: Number(p.monto_total) });
  }
  let saldo = 0;
  return [...meses.keys()].sort().map((k) => {
    const g = meses.get(k)!;
    const saldo_inicial = r2(saldo);
    const movs = g.movs
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((m) => { saldo = r2(saldo + m.cargo - m.abono); return { ...m, saldo }; });
    return { periodo: k, saldo_inicial, cargos: g.cargos, abonos: g.abonos, saldo_final: r2(saldo), movimientos: movs };
  });
}

function nombreMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Main component ──
export default function MapaComplejo({ editable = false }: { editable?: boolean }) {
  const [unidades, setUnidades] = useState<UnidadMapa[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filtro, setFiltro] = useState<NivelMapa | "todos">("todos");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [selId, setSelId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [q, setQ] = useState("");

  // Edit mode state
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Estado de cuenta drawer (solo vista)
  const [ecId, setEcId] = useState<string | null>(null);
  const [ecData, setEcData] = useState<EstadoCuenta | null>(null);
  const [ecLoading, setEcLoading] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMapaUnidades()
      .then(setUnidades)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // ── Handlers for view mode (drawer) ──
  function openFromTable(u: UnidadMapa) {
    if (editable) {
      // In edit mode: select unit for editing, scroll to map
      setEditId(u.id);
      setSelId(u.id);
      if (hasCoords(u)) setFlyTo({ lat: Number(u.lat), lng: Number(u.lng) });
      mapRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    // In view mode: open estado de cuenta drawer
    setSelId(u.id);
    if (hasCoords(u)) setFlyTo({ lat: Number(u.lat), lng: Number(u.lng) });
    mapRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    loadEC(u);
  }

  function openFromMap(u: UnidadMapa) {
    if (editable) {
      setEditId(u.id);
      setSelId(u.id);
      return;
    }
    setSelId(u.id);
    loadEC(u);
  }

  function loadEC(u: UnidadMapa) {
    if (ecId === u.id) return;
    setEcId(u.id);
    setEcData(null);
    setEcLoading(true);
    getEstadoCuenta(u.id)
      .then(setEcData)
      .catch(() => setEcData(null))
      .finally(() => setEcLoading(false));
  }

  function closeEC() {
    setEcId(null);
    setEcData(null);
  }

  // ── Handlers for edit mode (drag & click-to-place) ──
  async function handleDragEnd(uId: string, lat: number, lng: number) {
    setSaving(true);
    try {
      await updateUnidadCoords(uId, { lat, lng });
      setUnidades((prev) => prev.map((u) => (u.id === uId ? { ...u, lat, lng } : u)));
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleMapClick(lat: number, lng: number) {
    if (!editId || saving) return;
    const u = unidades.find((x) => x.id === editId);
    if (!u || hasCoords(u)) return; // only place units without coords
    setSaving(true);
    try {
      await updateUnidadCoords(editId, { lat, lng });
      setUnidades((prev) => prev.map((x) => (x.id === editId ? { ...x, lat, lng } : x)));
      setFlyTo({ lat, lng });
    } catch { /* ignore */ }
    setSaving(false);
  }

  const estadosUnicos = useMemo(() => {
    const set = new Set(unidades.map((u) => u.estado_actual?.nombre).filter(Boolean) as string[]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [unidades]);

  const visibles = unidades.filter((u) => {
    if (!hasCoords(u)) return false;
    if (filtro !== "todos" && u.nivel !== filtro) return false;
    if (filtroEstado !== "todos" && (u.estado_actual?.nombre ?? "") !== filtroEstado) return false;
    if (q.trim()) {
      const s = q.toLowerCase();
      const prop = u.propietario_actual;
      if (
        !u.numero_propiedad?.toLowerCase().includes(s) &&
        !u.id.toLowerCase().includes(s) &&
        !u.calle?.toLowerCase().includes(s) &&
        !(prop && `${prop.nombre} ${prop.apellido}`.toLowerCase().includes(s))
      ) return false;
    }
    return true;
  });

  const centro = useMemo<[number, number]>(() => {
    const con = unidades.filter(hasCoords);
    if (con.length === 0) return CENTRO_DEFAULT;
    return [
      con.reduce((s, u) => s + Number(u.lat), 0) / con.length,
      con.reduce((s, u) => s + Number(u.lng), 0) / con.length,
    ];
  }, [unidades]);

  const orden = [...unidades]
    .filter((u) => {
      if (filtroEstado !== "todos" && (u.estado_actual?.nombre ?? "") !== filtroEstado) return false;
      if (filtro !== "todos" && u.nivel !== filtro) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      const prop = u.propietario_actual;
      return (
        u.numero_propiedad?.toLowerCase().includes(s) ||
        u.id.toLowerCase().includes(s) ||
        u.calle?.toLowerCase().includes(s) ||
        (prop && `${prop.nombre} ${prop.apellido}`.toLowerCase().includes(s))
      );
    })
    .sort((a, b) => (a.numero_propiedad ?? a.id).localeCompare(b.numero_propiedad ?? b.id));

  const selUnidad = ecId ? unidades.find((u) => u.id === ecId) : null;
  const editUnidad = editId ? unidades.find((u) => u.id === editId) : null;
  const editPendingPlace = editUnidad && !hasCoords(editUnidad);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mapa del complejo</h1>
        <p className="text-base text-black/50">
          {editable
            ? "Arrastra los marcadores para mover · selecciona una propiedad sin ubicar y haz clic en el mapa"
            : "Clic en un punto para ver su estado de cuenta"}
        </p>
      </div>

      {!loaded ? (
        <div className="py-16 text-center text-base text-black/40">Cargando mapa…</div>
      ) : (
        <>
          {/* Filtro por segmento */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setFiltro("todos")}
              className={`rounded-full px-3 py-1 text-etiqueta uppercase tracking-wide transition-colors ${
                filtro === "todos" ? "bg-sidebar-accent text-white" : "bg-black/5 text-black/55 hover:bg-black/10"
              }`}
            >
              Todos
            </button>
            {(Object.keys(NIVEL) as NivelMapa[]).map((n) => (
              <button
                key={n}
                onClick={() => setFiltro(n)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-etiqueta uppercase tracking-wide transition-colors ${
                  filtro === n ? "text-white" : "bg-black/5 text-black/55 hover:bg-black/10"
                }`}
                style={filtro === n ? { background: NIVEL[n].color } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: NIVEL[n].color }} />
                {NIVEL[n].label}
              </button>
            ))}
          </div>

          {/* Filtro por tipo de propiedad */}
          {!editable && estadosUnicos.length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-etiqueta text-black/40 mr-1">Tipo:</span>
              <button
                onClick={() => setFiltroEstado("todos")}
                className={`rounded-full px-3 py-1 text-etiqueta uppercase tracking-wide transition-colors ${
                  filtroEstado === "todos" ? "bg-sidebar-accent text-white" : "bg-black/5 text-black/55 hover:bg-black/10"
                }`}
              >
                Todos
              </button>
              {estadosUnicos.map((e) => (
                <button
                  key={e}
                  onClick={() => setFiltroEstado(e)}
                  className={`rounded-full px-3 py-1 text-etiqueta uppercase tracking-wide transition-colors ${
                    filtroEstado === e ? "bg-sidebar-accent text-white" : "bg-black/5 text-black/55 hover:bg-black/10"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          {/* Mapa + panel edición */}
          <div className={editable && editId ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : ""}>
            <div ref={mapRef} className={editable && editId ? "lg:col-span-2" : ""}>
              <MapContainer
                center={centro}
                zoom={unidades.some(hasCoords) ? 16 : 13}
                style={{ height: "520px", borderRadius: "8px" }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <FlyTo target={flyTo} />
                {editable && editPendingPlace && <MapClickHandler onMapClick={handleMapClick} />}
                {visibles.map((u) => {
                  const prop = u.propietario_actual;
                  return (
                    <Marker
                      key={u.id}
                      position={toLatLng(u)}
                      icon={pin(NIVEL[u.nivel].color, u.id === selId, u.estado_actual?.nombre)}
                      zIndexOffset={u.id === selId ? 1000 : 0}
                      draggable={editable}
                      eventHandlers={{
                        click: () => openFromMap(u),
                        dragend: editable
                          ? (e) => {
                              const ll = e.target.getLatLng();
                              handleDragEnd(u.id, ll.lat, ll.lng);
                            }
                          : undefined,
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -10]}>
                        <div className="text-xs leading-tight">
                          {u.estado_actual && (
                            <div className="font-bold text-[10px] uppercase tracking-wide text-sidebar-accent mb-0.5">
                              {u.estado_actual.nombre}
                            </div>
                          )}
                          <div className="font-semibold">#{u.numero_propiedad ?? u.id}</div>
                          <div>{prop ? `${prop.nombre} ${prop.apellido}` : "Sin propietario"}</div>
                          {u.calle && <div className="text-black/50">{u.calle}</div>}
                          {u.bloque && <div className="text-black/50">Bloque {u.bloque}</div>}
                        </div>
                      </Tooltip>
                    </Marker>
                  );
                })}
              </MapContainer>

              {/* Leyenda */}
              <div className="mt-2 flex flex-wrap gap-4 text-etiqueta uppercase tracking-wide text-black/50">
                {(Object.keys(NIVEL) as NivelMapa[]).map((n) => (
                  <span key={n} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: NIVEL[n].color }} />
                    {NIVEL[n].label}
                  </span>
                ))}
              </div>
            </div>

            {/* Panel lateral de edición — solo en modo editable cuando hay unidad seleccionada */}
            {editable && editUnidad && (
              <div className="lg:col-span-1">
                <div className="rounded-lg border border-black/10 bg-white overflow-hidden">
                  <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 bg-sidebar-accent/5">
                    <div className="flex items-center gap-2">
                      <IconMapPin size={16} className="text-sidebar-accent" />
                      <span className="text-base font-semibold">Editando ubicación</span>
                    </div>
                    <button onClick={() => { setEditId(null); setSelId(null); }} className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black">
                      <IconX size={16} />
                    </button>
                  </div>

                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: NIVEL[editUnidad.nivel].color }} />
                      <span className="text-base font-bold">#{editUnidad.numero_propiedad ?? editUnidad.id}</span>
                      {editUnidad.estado_actual && (
                        <span className="rounded bg-sidebar-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-accent">
                          {editUnidad.estado_actual.nombre}
                        </span>
                      )}
                    </div>

                    <div className="text-base">
                      {editUnidad.propietario_actual
                        ? `${editUnidad.propietario_actual.nombre} ${editUnidad.propietario_actual.apellido}`
                        : <span className="text-black/40">Sin propietario</span>}
                    </div>

                    <div className="text-etiqueta text-black/50">
                      {[editUnidad.calle, editUnidad.bloque ? `Bloque ${editUnidad.bloque}` : null].filter(Boolean).join(" · ") || "—"}
                    </div>

                    <div className="mt-3 rounded-md border border-black/10 bg-black/3 px-3 py-2">
                      {hasCoords(editUnidad) ? (
                        <>
                          <div className="text-etiqueta font-medium text-black/40 mb-1">Coordenadas actuales</div>
                          <div className="font-mono text-base">
                            {Number(editUnidad.lat).toFixed(6)}, {Number(editUnidad.lng).toFixed(6)}
                          </div>
                          <div className="mt-2 text-etiqueta text-black/40">
                            Arrastra el marcador en el mapa para mover
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-etiqueta font-medium text-amber-600 mb-1">Sin ubicación</div>
                          <div className="text-base text-black/50">
                            Haz clic en el mapa para colocar esta propiedad
                          </div>
                        </>
                      )}
                    </div>

                    {saving && (
                      <div className="text-etiqueta text-sidebar-accent font-medium">Guardando...</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Drawer estado de cuenta (solo en modo vista) */}
          {!editable && ecId && (
            <>
              <div className="fixed inset-0 bg-black/30" style={{ zIndex: 9998 }} onClick={closeEC} />
              <div className="fixed top-0 right-0 h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl animate-slide-in" style={{ zIndex: 9999 }}>
                <ECPanel
                  unidad={selUnidad ?? null}
                  data={ecData}
                  loading={ecLoading}
                  nivel={NIVEL}
                  onClose={closeEC}
                />
              </div>
            </>
          )}

          {/* Tabla de todas las propiedades */}
          <Panel title={`Propiedades (${unidades.length})`}>
            <div className="mb-3 relative">
              <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black/30" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar propiedad, propietario o calle…"
                className={`${inputCls} pl-8`}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-tabla">
                <thead>
                  <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                    <th className="py-1.5 font-medium">#</th>
                    <th className="py-1.5 font-medium">Propietario</th>
                    <th className="py-1.5 font-medium">Calle</th>
                    <th className="py-1.5 font-medium">Bloque</th>
                    <th className="py-1.5 text-right font-medium">Saldo</th>
                    <th className="py-1.5 font-medium">Segmento</th>
                    <th className="py-1.5 font-medium">Ubicación</th>
                  </tr>
                </thead>
                <tbody>
                  {orden.map((u) => (
                    <tr
                      key={u.id}
                      id={`maprow-${u.id}`}
                      onClick={() => openFromTable(u)}
                      className={`cursor-pointer border-b-[0.5px] border-black/5 transition-colors ${
                        (editable ? editId : selId) === u.id ? "bg-sidebar-accent/10" : "hover:bg-black/3"
                      }`}
                    >
                      <td className="py-2 font-mono font-medium">{u.numero_propiedad ?? u.id}</td>
                      <td className="py-2">
                        {u.propietario_actual
                          ? `${u.propietario_actual.nombre} ${u.propietario_actual.apellido}`
                          : <span className="text-black/35">—</span>}
                      </td>
                      <td className="py-2 text-black/70">{u.calle ?? <span className="text-black/25">—</span>}</td>
                      <td className="py-2 text-black/70">{u.bloque || <span className="text-black/25">—</span>}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(u.saldo_pendiente)}</td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: NIVEL[u.nivel].color }} />
                          <span className="text-etiqueta font-medium" style={{ color: NIVEL[u.nivel].color }}>
                            {NIVEL[u.nivel].label}
                          </span>
                        </span>
                      </td>
                      <td className="py-2">
                        {hasCoords(u)
                          ? <span className="font-mono text-etiqueta text-black/45">{Number(u.lat).toFixed(5)}, {Number(u.lng).toFixed(5)}</span>
                          : <span className="text-etiqueta text-black/25">Sin ubicar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

// ── Panel lateral: estado de cuenta (drawer) ──
function ECPanel({
  unidad,
  data,
  loading,
  nivel,
  onClose,
}: {
  unidad: UnidadMapa | null;
  data: EstadoCuenta | null;
  loading: boolean;
  nivel: Record<NivelMapa, { color: string; label: string }>;
  onClose: () => void;
}) {
  if (loading) {
    return (
      <Panel>
        <div className="py-12 text-center text-base text-black/40">Cargando estado de cuenta…</div>
      </Panel>
    );
  }

  if (!data || !unidad) {
    return (
      <Panel>
        <div className="py-12 text-center text-base text-black/40">No se pudo cargar</div>
      </Panel>
    );
  }

  const { kpis, cargos, pagos } = data;
  const prop = data.unidad.propietario_actual;
  const kardex = construirKardex(cargos, pagos);
  const saldoActual = kardex.length ? kardex[kardex.length - 1].saldo_final : 0;
  const nv = nivel[unidad.nivel];

  return (
    <div className="rounded-lg border border-black/10 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: nv.color }} />
          <span className="text-base font-semibold">#{unidad.numero_propiedad ?? unidad.id}</span>
          {unidad.estado_actual && (
            <span className="rounded bg-sidebar-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-accent">
              {unidad.estado_actual.nombre}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <a
            href={`/pagos/estado-cuenta/${encodeURIComponent(unidad.id)}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded px-2 py-1 text-etiqueta font-medium text-sidebar-accent hover:bg-sidebar-accent/10"
          >
            <IconFileText size={14} />
            Ver PDF
          </a>
          <button onClick={onClose} className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black">
            <IconX size={16} />
          </button>
        </div>
      </div>

      {/* Propietario */}
      <div className="border-b border-black/5 px-4 py-3">
        <div className="text-base font-semibold">
          {prop ? `${prop.nombre} ${prop.apellido}` : "Sin propietario"}
        </div>
        <div className="text-etiqueta text-black/50">
          {[unidad.calle, unidad.bloque ? `Bloque ${unidad.bloque}` : null].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>

      {/* KPIs compactos */}
      <div className="grid grid-cols-2 gap-px border-b border-black/5 bg-black/5">
        <KpiCell label="Saldo pendiente" value={kpis.saldo_pendiente} highlight={kpis.saldo_pendiente > 0} />
        <KpiCell label="Crédito a favor" value={kpis.credito_a_favor} />
        <KpiCell label="Pagado este año" value={kpis.total_pagado_anio} />
        <div className="bg-white px-3 py-2">
          <div className="text-etiqueta text-black/40">Último pago</div>
          <div className="font-mono text-base font-semibold">{kpis.ultimo_pago ? formatDate(kpis.ultimo_pago) : "—"}</div>
        </div>
      </div>

      {/* Kardex scrollable */}
      <div className="max-h-[340px] overflow-y-auto px-4 py-3">
        <div className="mb-2 text-etiqueta font-semibold uppercase tracking-wide text-black/40">Kardex</div>
        {kardex.length === 0 ? (
          <p className="py-4 text-center text-base text-black/40">Sin movimientos</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-black/10 text-left text-[10px] text-black/40">
                <th className="py-1">Fecha</th>
                <th className="py-1">Concepto</th>
                <th className="py-1 text-right">Cargo</th>
                <th className="py-1 text-right">Abono</th>
                <th className="py-1 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {kardex.map((m) => (
                <Fragment key={m.periodo}>
                  <tr className="bg-black/3">
                    <td colSpan={4} className="py-1 font-semibold text-sidebar-accent text-[10px]">
                      {nombreMes(m.periodo)}
                    </td>
                    <td className="py-1 text-right text-[9px] text-black/30">
                      {formatCurrency(m.saldo_inicial)}
                    </td>
                  </tr>
                  {m.movimientos.map((mv, i) => (
                    <tr key={i} className="border-b border-black/5">
                      <td className="py-0.5 font-mono">{formatDate(mv.fecha)}</td>
                      <td className="py-0.5 max-w-[120px] truncate">{mv.concepto}</td>
                      <td className="py-0.5 text-right font-mono">{mv.cargo ? formatCurrency(mv.cargo) : ""}</td>
                      <td className="py-0.5 text-right font-mono text-green-700">{mv.abono ? formatCurrency(mv.abono) : ""}</td>
                      <td className="py-0.5 text-right font-mono font-medium">{formatCurrency(mv.saldo)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Saldo final */}
      <div className="flex items-center justify-between border-t border-black/10 px-4 py-3">
        <span className="text-base font-semibold text-black/60">SALDO A LA FECHA</span>
        <MonoAmount value={saldoActual} className={`text-lg font-bold ${saldoActual > 0 ? "text-red-600" : "text-green-700"}`} />
      </div>
    </div>
  );
}

function KpiCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="bg-white px-3 py-2">
      <div className="text-etiqueta text-black/40">{label}</div>
      <MonoAmount value={value} className={`text-base font-semibold ${highlight ? "text-red-600" : ""}`} />
    </div>
  );
}
