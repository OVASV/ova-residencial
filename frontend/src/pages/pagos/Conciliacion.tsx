import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  IconArrowLeft,
  IconFileSpreadsheet,
  IconArrowRight,
  IconCheck,
  IconLink,
  IconAlertTriangle,
} from "@tabler/icons-react";
import {
  crearConciliacion,
  getConciliaciones,
  getConciliacion,
  matchLinea,
  confirmarConciliacion,
  anularConciliacion,
  type Conciliacion as Concil,
  type ConciliacionListItem,
  type LineaBanco,
  type TipoMatch,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import MonoAmount from "../../components/ui/MonoAmount";
import { inputCls, labelCls } from "../../components/ui/form";
import { formatCurrency, formatDate } from "../../utils/formatters";

const mesActual = () => new Date().toISOString().slice(0, 7);

const MATCH: Record<TipoMatch | "sin_match_sistema", { label: string; color: string }> = {
  conciliado: { label: "Conciliado", color: "#1D9E75" },
  diferencia: { label: "Diferencia", color: "#EF9F27" },
  sin_match_banco: { label: "Sin pago en sistema", color: "#E24B4A" },
  sin_match_sistema: { label: "Sin movimiento en banco", color: "#7B5EA7" },
};

/* ---------- parseo del Excel ---------- */
function parseMonto(v: unknown): number {
  if (typeof v === "number") return Math.abs(v);
  let s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.abs(n) : NaN;
}
function parseFecha(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}
function guessCol(headers: string[], kws: string[]) {
  return headers.findIndex((h) => kws.some((k) => h.toLowerCase().includes(k)));
}

type Mapeo = { fecha: number; monto: number; referencia: number; descripcion: number };

export default function Conciliacion() {
  const navigate = useNavigate();
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [periodo, setPeriodo] = useState(mesActual());
  const [banco, setBanco] = useState("");
  const [archivo, setArchivo] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [map, setMap] = useState<Mapeo>({ fecha: -1, monto: -1, referencia: -1, descripcion: -1 });
  const [concil, setConcil] = useState<Concil | null>(null);
  const [recientes, setRecientes] = useState<ConciliacionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function cargarRecientes() {
    getConciliaciones().then(setRecientes).catch(() => {});
  }
  useEffect(() => cargarRecientes(), []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });
      const hIdx = data.findIndex((r) => Array.isArray(r) && r.some((c) => c != null && String(c).trim() !== ""));
      if (hIdx < 0) throw new Error("El archivo está vacío");
      const hs = (data[hIdx] as unknown[]).map((c) => String(c ?? "").trim());
      setHeaders(hs);
      setRows(data.slice(hIdx + 1) as unknown[][]);
      setArchivo(file.name);
      setMap({
        fecha: guessCol(hs, ["fecha", "date"]),
        monto: guessCol(hs, ["haber", "abono", "crédito", "credito", "depósito", "deposito", "monto", "importe", "valor"]),
        referencia: guessCol(hs, ["refer", "documento", "boleta", "no.", "num"]),
        descripcion: guessCol(hs, ["descrip", "concepto", "detalle", "glosa", "observ"]),
      });
      setPaso(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo");
    }
  }

  const lineasParseadas: LineaBanco[] = rows
    .map((r) => ({
      monto: parseMonto(r[map.monto]),
      fecha_mov: map.fecha >= 0 ? parseFecha(r[map.fecha]) : undefined,
      referencia: map.referencia >= 0 && r[map.referencia] != null ? String(r[map.referencia]).trim() : undefined,
      descripcion: map.descripcion >= 0 && r[map.descripcion] != null ? String(r[map.descripcion]).trim() : undefined,
    }))
    .filter((l) => Number.isFinite(l.monto) && l.monto > 0);

  async function procesar() {
    setError(null);
    if (map.monto < 0) return setError("Debes indicar la columna del monto.");
    if (lineasParseadas.length === 0) return setError("No se detectaron montos válidos con ese mapeo.");
    setBusy(true);
    try {
      const c = await crearConciliacion({ periodo, banco: banco.trim() || undefined, archivo_nombre: archivo, lineas: lineasParseadas });
      setConcil(c);
      setPaso(3);
      cargarRecientes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar");
    } finally {
      setBusy(false);
    }
  }

  async function abrir(id: string) {
    setBusy(true);
    try {
      const c = await getConciliacion(id);
      setConcil(c);
      setPeriodo(c.periodo);
      setPaso(3);
    } finally {
      setBusy(false);
    }
  }

  function reiniciar() {
    setConcil(null);
    setHeaders([]);
    setRows([]);
    setArchivo("");
    setPaso(1);
    cargarRecientes();
  }

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => navigate("/pagos")} className="mb-1 flex items-center gap-1 text-base text-black/45 hover:text-ink">
          <IconArrowLeft size={15} /> Pagos
        </button>
        <h1 className="text-lg font-semibold">Conciliación bancaria</h1>
      </div>

      <Stepper paso={paso} />

      {error && (
        <div className="rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-3 text-base text-estado-atrasado">
          {error}
        </div>
      )}

      {paso === 1 && (
        <>
          <Panel title="1 · Período y archivo del banco">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <span className={labelCls}>Período *</span>
                <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={`${inputCls} mt-1`} />
              </label>
              <label className="block">
                <span className={labelCls}>Banco</span>
                <input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Banco Industrial…" className={`${inputCls} mt-1`} />
              </label>
              <label className="block">
                <span className={labelCls}>Archivo (Excel .xlsx/.xls)</span>
                <input type="file" accept=".xlsx,.xls" onChange={onFile} className="mt-1 block w-full text-base file:mr-3 file:rounded-md file:border-0 file:bg-sidebar-accent file:px-3 file:py-1.5 file:text-white" />
              </label>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-etiqueta uppercase tracking-wide text-black/40">
              <IconFileSpreadsheet size={14} /> El archivo se lee en tu navegador; luego mapeas las columnas.
            </p>
          </Panel>

          <Panel title="Conciliaciones recientes">
            {recientes.length === 0 ? (
              <p className="py-4 text-center text-base text-black/40">Aún no hay conciliaciones.</p>
            ) : (
              <table className="w-full text-tabla">
                <thead>
                  <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                    <th className="py-1.5 font-medium">Período</th>
                    <th className="py-1.5 font-medium">Banco</th>
                    <th className="py-1.5 font-medium">Movs.</th>
                    <th className="py-1.5 text-right font-medium">Total banco</th>
                    <th className="py-1.5 font-medium">Estado</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((c) => (
                    <tr key={c.id} className="border-b-[0.5px] border-black/5">
                      <td className="py-2 font-mono">{c.periodo}</td>
                      <td className="py-2">{c.banco ?? "—"}</td>
                      <td className="py-2 font-mono">{c._count.conciliacion_lineas}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(Number(c.total_banco ?? 0))}</td>
                      <td className="py-2"><EstadoBadge estado={c.estado} /></td>
                      <td className="py-2 text-right">
                        <button onClick={() => abrir(c.id)} className="text-base text-sidebar-accent hover:underline">Abrir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {paso === 2 && (
        <Panel title="2 · Mapear columnas">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(["fecha", "monto", "referencia", "descripcion"] as const).map((campo) => (
              <label key={campo} className="block">
                <span className={labelCls}>
                  {campo === "monto" ? "Monto *" : campo === "descripcion" ? "Descripción" : campo}
                </span>
                <select
                  value={map[campo]}
                  onChange={(e) => setMap((m) => ({ ...m, [campo]: Number(e.target.value) }))}
                  className={`${inputCls} mt-1`}
                >
                  <option value={-1}>— ninguna —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 text-etiqueta uppercase tracking-wide text-black/45">
            Vista previa ({lineasParseadas.length} movimientos válidos de {rows.length} filas)
          </div>
          <div className="mt-1 max-h-56 overflow-auto rounded-md border-[0.5px] border-black/15">
            <table className="w-full text-tabla">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                  <th className="px-2 py-1.5 font-medium">Fecha</th>
                  <th className="px-2 py-1.5 font-medium">Referencia</th>
                  <th className="px-2 py-1.5 font-medium">Descripción</th>
                  <th className="px-2 py-1.5 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {lineasParseadas.slice(0, 30).map((l, i) => (
                  <tr key={i} className="border-b-[0.5px] border-black/5">
                    <td className="px-2 py-1.5 font-mono">{l.fecha_mov ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono">{l.referencia ?? "—"}</td>
                    <td className="px-2 py-1.5 text-black/60">{l.descripcion ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(l.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setPaso(1)}>
              <IconArrowLeft size={16} /> Atrás
            </Button>
            <Button onClick={procesar} disabled={busy || map.monto < 0}>
              {busy ? "Procesando…" : "Procesar y conciliar"} <IconArrowRight size={16} />
            </Button>
          </div>
        </Panel>
      )}

      {paso === 3 && concil && (
        <Revision concil={concil} onChange={setConcil} onReiniciar={reiniciar} />
      )}
    </div>
  );
}

function Revision({
  concil,
  onChange,
  onReiniciar,
}: {
  concil: Concil;
  onChange: (c: Concil) => void;
  onReiniciar: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const cerrada = concil.estado === "confirmada" || concil.estado === "anulada";
  const difBanco = Number(concil.total_banco ?? 0) - Number(concil.total_sistema ?? 0);

  async function asignar(id_linea: string, id_pago: string | null) {
    setBusy(true);
    try {
      onChange(await matchLinea(concil.id, { id_linea, id_pago }));
    } finally {
      setBusy(false);
    }
  }
  async function confirmar() {
    setBusy(true);
    try {
      onChange(await confirmarConciliacion(concil.id));
    } finally {
      setBusy(false);
    }
  }
  async function anular() {
    if (!confirm("¿Anular la conciliación? Se revertirán los pagos marcados como conciliados.")) return;
    setBusy(true);
    try {
      onChange(await anularConciliacion(concil.id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel title={`3 · Revisión · ${concil.periodo}${concil.banco ? ` · ${concil.banco}` : ""}`}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <EstadoBadge estado={concil.estado} />
          {(["conciliado", "diferencia", "sin_match_banco", "sin_match_sistema"] as const).map((k) => (
            <span
              key={k}
              className="rounded-full px-2.5 py-0.5 text-etiqueta font-medium uppercase"
              style={{ background: `${MATCH[k].color}22`, color: MATCH[k].color }}
            >
              {MATCH[k].label}: {concil.resumen[k]}
            </span>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-lg">
          <Kpi label="Total banco" value={Number(concil.total_banco ?? 0)} />
          <Kpi label="Total sistema" value={Number(concil.total_sistema ?? 0)} />
          <Kpi label="Diferencia" value={difBanco} tone={Math.abs(difBanco) > 0.001 ? "text-estado-atrasado" : ""} />
        </div>

        {/* Líneas del banco */}
        <div className="text-etiqueta uppercase tracking-wide text-black/45">Movimientos del banco</div>
        <table className="mt-1 w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">Fecha</th>
              <th className="py-1.5 font-medium">Referencia</th>
              <th className="py-1.5 font-medium">Descripción</th>
              <th className="py-1.5 text-right font-medium">Monto</th>
              <th className="py-1.5 font-medium">Match</th>
              <th className="py-1.5 font-medium">Pago</th>
            </tr>
          </thead>
          <tbody>
            {concil.conciliacion_lineas.map((l) => (
              <tr key={l.id} className="border-b-[0.5px] border-black/5">
                <td className="py-2 font-mono">{l.fecha_mov ? formatDate(l.fecha_mov) : "—"}</td>
                <td className="py-2 font-mono text-black/60">{l.referencia ?? "—"}</td>
                <td className="py-2 text-black/60">{l.descripcion ?? "—"}</td>
                <td className="py-2 text-right"><MonoAmount value={Number(l.monto)} /></td>
                <td className="py-2"><MatchBadge tipo={l.tipo_match} /></td>
                <td className="py-2">
                  {l.pagos ? (
                    <span className="font-mono text-black/70">
                      {l.pagos.id_unidad} · {formatCurrency(Number(l.pagos.monto_total))}
                    </span>
                  ) : cerrada ? (
                    <span className="text-black/35">—</span>
                  ) : (
                    <select
                      value=""
                      disabled={busy || concil.sin_match_sistema.length === 0}
                      onChange={(e) => e.target.value && asignar(l.id, e.target.value)}
                      className={`${inputCls} py-1`}
                    >
                      <option value="">Asignar pago…</option>
                      {concil.sin_match_sistema.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id_unidad} · {formatCurrency(Number(p.monto_total))}
                          {p.referencia_banco ? ` · ${p.referencia_banco}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {l.pagos && !cerrada && (
                    <button onClick={() => asignar(l.id, null)} className="ml-2 text-etiqueta text-estado-atrasado hover:underline">
                      quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagos sin movimiento en el banco */}
        {concil.sin_match_sistema.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-etiqueta uppercase tracking-wide" style={{ color: MATCH.sin_match_sistema.color }}>
              <IconAlertTriangle size={14} /> Pagos en sistema sin movimiento en el banco ({concil.sin_match_sistema.length})
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {concil.sin_match_sistema.map((p) => (
                <span key={p.id} className="rounded-md bg-black/5 px-2.5 py-1 font-mono text-etiqueta">
                  {p.id_unidad} · {formatCurrency(Number(p.monto_total))}
                </span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onReiniciar}>Nueva conciliación</Button>
        <div className="flex gap-2">
          {concil.estado !== "anulada" && concil.estado === "confirmada" && (
            <Button variant="danger" onClick={anular} disabled={busy}>Anular</Button>
          )}
          {concil.estado === "en_revision" && (
            <Button onClick={confirmar} disabled={busy}>
              <IconCheck size={16} /> {busy ? "Confirmando…" : "Confirmar conciliación"}
            </Button>
          )}
          {concil.estado === "confirmada" && (
            <span className="flex items-center gap-1 text-base text-estado-pagado">
              <IconLink size={16} /> Conciliación confirmada
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border-[0.5px] border-black/15 bg-white p-3">
      <div className="mb-1 text-etiqueta uppercase tracking-wide text-black/45">{label}</div>
      <MonoAmount value={value} className={`font-semibold ${tone}`} />
    </div>
  );
}

function MatchBadge({ tipo }: { tipo: TipoMatch }) {
  const m = MATCH[tipo];
  return (
    <span className="rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase" style={{ background: `${m.color}22`, color: m.color }}>
      {m.label}
    </span>
  );
}

const ESTADO_COLORS: Record<string, string> = {
  borrador: "bg-black/5 text-black/50",
  en_revision: "bg-estado-pendiente/15 text-estado-pendiente",
  confirmada: "bg-estado-pagado/12 text-estado-pagado",
  anulada: "bg-black/5 text-black/45",
};
function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${ESTADO_COLORS[estado] ?? "bg-black/5"}`}>
      {estado.replace("_", " ")}
    </span>
  );
}

function Stepper({ paso }: { paso: number }) {
  const pasos = ["Archivo", "Mapear columnas", "Revisar y confirmar"];
  return (
    <div className="flex items-center gap-2">
      {pasos.map((label, i) => {
        const n = i + 1;
        const done = paso > n;
        const active = paso === n;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-etiqueta font-semibold ${active ? "bg-sidebar-accent text-white" : done ? "bg-estado-pagado text-white" : "bg-black/10 text-black/45"}`}>
              {done ? <IconCheck size={13} /> : n}
            </div>
            <span className={`text-base ${active ? "font-medium text-ink" : "text-black/45"}`}>{label}</span>
            {i < pasos.length - 1 && <div className="h-[0.5px] flex-1 bg-black/15" />}
          </div>
        );
      })}
    </div>
  );
}
