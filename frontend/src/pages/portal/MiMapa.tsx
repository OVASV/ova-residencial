import { useEffect, useState, Fragment } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IconX, IconPrinter } from "@tabler/icons-react";
import {
  getMisUnidades,
  getPortalEstadoCuenta,
  type MiUnidad,
  type EstadoCuenta,
  type Cargo,
  type Pago,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import { formatCurrency, formatDate } from "../../utils/formatters";

const CENTRO_DEFAULT: [number, number] = [14.6349, -90.5069];

const ESTADO_SVG: Record<string, string> = {
  casa: `<path d="M3 12l9-8 9 8" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="5" y="12" width="14" height="9" rx="1" fill="none" stroke="white" stroke-width="2"/><rect x="9" y="15" width="6" height="6" rx="0.5" fill="none" stroke="white" stroke-width="1.5"/>`,
  terreno: `<rect x="3" y="16" width="18" height="2" rx="1" fill="white"/><path d="M5 16 L8 10 L11 14 L15 8 L19 16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  construccion: `<rect x="6" y="10" width="12" height="11" rx="1" fill="none" stroke="white" stroke-width="2"/><path d="M12 3 L12 10" stroke="white" stroke-width="2.2" stroke-linecap="round"/><path d="M7 6 L17 6" stroke="white" stroke-width="2" stroke-linecap="round"/><rect x="9" y="14" width="2" height="3" fill="white" rx="0.3"/><rect x="13" y="14" width="2" height="3" fill="white" rx="0.3"/>`,
  airbnb: `<circle cx="12" cy="8" r="3" fill="none" stroke="white" stroke-width="2"/><path d="M6 21 C6 16 9 13 12 13 C15 13 18 16 18 21" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M4 12 L12 5 L20 12" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
};

function estadoToKey(nombre: string | null | undefined): string {
  if (!nombre) return "casa";
  const n = nombre.toLowerCase();
  if (n.includes("sin construc") || n.includes("terreno")) return "terreno";
  if (n.includes("en construc")) return "construccion";
  if (n.includes("airbnb")) return "airbnb";
  return "casa";
}

const pin = (selected = false, estadoNombre?: string | null) => {
  const size = selected ? 26 : 18;
  const color = "#085041";
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

// ── Kardex builder ──
const r2 = (n: number) => Math.round(n * 100) / 100;
interface Mov { fecha: string; concepto: string; cargo: number; abono: number; saldo: number }
interface MesK { periodo: string; saldo_inicial: number; cargos: number; abonos: number; saldo_final: number; movimientos: Mov[] }

function construirKardex(cargos: Cargo[], pagos: Pago[]): MesK[] {
  const meses = new Map<string, { cargos: number; abonos: number; movs: Omit<Mov, "saldo">[] }>();
  const get = (k: string) => { let g = meses.get(k); if (!g) { g = { cargos: 0, abonos: 0, movs: [] }; meses.set(k, g); } return g; };
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
    const movs = g.movs.sort((a, b) => a.fecha.localeCompare(b.fecha)).map((m) => { saldo = r2(saldo + m.cargo - m.abono); return { ...m, saldo }; });
    return { periodo: k, saldo_inicial, cargos: g.cargos, abonos: g.abonos, saldo_final: r2(saldo), movimientos: movs };
  });
}

function nombreMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MiMapa() {
  const [unidades, setUnidades] = useState<MiUnidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);

  // Estado de cuenta drawer
  const [ecId, setEcId] = useState<string | null>(null);
  const [ecData, setEcData] = useState<EstadoCuenta | null>(null);
  const [ecLoading, setEcLoading] = useState(false);

  useEffect(() => {
    getMisUnidades().then(setUnidades).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function openFromMap(u: MiUnidad) {
    setSelId(u.id);
    if (u.lat != null && u.lng != null) setFlyTo({ lat: u.lat, lng: u.lng });
    loadEC(u);
  }

  function loadEC(u: MiUnidad) {
    if (ecId === u.id) return;
    setEcId(u.id);
    setEcData(null);
    setEcLoading(true);
    getPortalEstadoCuenta(u.id)
      .then(setEcData)
      .catch(() => setEcData(null))
      .finally(() => setEcLoading(false));
  }

  function closeEC() {
    setEcId(null);
    setEcData(null);
    setSelId(null);
  }

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  const conCoords = unidades.filter((u) => u.lat != null && u.lng != null);
  const centro: [number, number] = conCoords.length
    ? [Number(conCoords[0].lat), Number(conCoords[0].lng)]
    : CENTRO_DEFAULT;

  const selUnidad = ecId ? unidades.find((u) => u.id === ecId) ?? null : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mi Ubicación</h1>
        <p className="text-base text-black/50">Clic en un punto para ver su estado de cuenta</p>
      </div>

      {conCoords.length === 0 ? (
        <div className="rounded-lg border-[0.5px] border-black/10 bg-white p-8 text-center text-black/40">
          Tus unidades aún no tienen coordenadas asignadas
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border-[0.5px] border-black/10" style={{ height: "calc(100vh - 180px)" }}>
          <MapContainer center={centro} zoom={18} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap"
            />
            <FlyTo target={flyTo} />
            {conCoords.map((u) => (
              <Marker
                key={u.id}
                position={[Number(u.lat), Number(u.lng)]}
                icon={pin(u.id === selId, u.estado)}
                zIndexOffset={u.id === selId ? 1000 : 0}
                eventHandlers={{ click: () => openFromMap(u) }}
              >
                <Tooltip direction="top" offset={[0, -10]}>
                  <div className="text-xs leading-tight">
                    {u.estado && (
                      <div className="font-bold text-[10px] uppercase tracking-wide text-sidebar-accent mb-0.5">
                        {u.estado}
                      </div>
                    )}
                    <div className="font-semibold">#{u.numero_propiedad ?? u.id}</div>
                    {u.calle && <div className="text-black/50">{u.calle}</div>}
                    {u.bloque && <div className="text-black/50">Bloque {u.bloque}</div>}
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* Drawer estado de cuenta */}
      {ecId && (
        <>
          <div className="fixed inset-0 bg-black/30" style={{ zIndex: 9998 }} onClick={closeEC} />
          <div className="fixed top-0 right-0 h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl animate-slide-in" style={{ zIndex: 9999 }}>
            <ECPanel unidad={selUnidad} data={ecData} loading={ecLoading} onClose={closeEC} />
          </div>
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
  onClose,
}: {
  unidad: MiUnidad | null;
  data: EstadoCuenta | null;
  loading: boolean;
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
  const kardex = construirKardex(cargos, pagos);
  const saldoActual = kardex.length ? kardex[kardex.length - 1].saldo_final : 0;

  return (
    <div className="rounded-lg border border-black/10 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
        <div>
          <div className="text-base font-semibold">#{unidad.numero_propiedad ?? unidad.id}</div>
          <div className="text-etiqueta text-black/50">
            {[unidad.calle, unidad.bloque ? `Bloque ${unidad.bloque}` : null].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={`/pagos/estado-cuenta/${encodeURIComponent(unidad.id)}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded px-2 py-1 text-etiqueta font-medium text-sidebar-accent hover:bg-sidebar-accent/10"
          >
            <IconPrinter size={14} />
            Imprimir
          </a>
          <button onClick={onClose} className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black">
            <IconX size={16} />
          </button>
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
        <span className={`font-mono text-lg font-bold ${saldoActual > 0 ? "text-red-600" : "text-green-700"}`}>
          {formatCurrency(saldoActual)}
        </span>
      </div>
    </div>
  );
}

function KpiCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="bg-white px-3 py-2">
      <div className="text-etiqueta text-black/40">{label}</div>
      <div className={`font-mono text-base font-semibold ${highlight ? "text-red-600" : ""}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}
