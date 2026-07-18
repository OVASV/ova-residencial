import { useEffect, useState } from "react";
import { IconBrandWhatsapp, IconMail, IconSend, IconDeviceFloppy, IconHome, IconSearch } from "@tabler/icons-react";
import {
  getDestinatarios,
  getAvisos,
  createAviso,
  type Destinatario,
  type AvisosHistorial,
  type TipoAviso,
  type CanalAviso,
  type FiltroDest,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { inputCls, labelCls } from "../../components/ui/form";
import { formatCurrency, formatDate } from "../../utils/formatters";

const TIPOS: { id: TipoAviso; label: string; plantilla: string }[] = [
  { id: "recordatorio_pago", label: "Recordatorio de pago", plantilla: "Hola {nombre}, le recordamos que su cuota del mes de {mes_nombre}, año {mes_anio} por un monto de {cuota} se encuentra pendiente. Agradecemos su pronto pago." },
  { id: "aviso_mora", label: "Aviso de mora", plantilla: "Estimado/a {nombre}, su cuenta presenta una mora de atraso por un total de {monto_total}. Le solicitamos regularizar su pago a la brevedad." },
  { id: "mantenimiento", label: "Mantenimiento programado", plantilla: "Estimados vecinos, se realizará mantenimiento programado el {fecha} a las {hora}. Disculpen las molestias." },
  { id: "reunion", label: "Reunión de vecinos", plantilla: "Convocatoria a reunión de vecinos el {fecha} a las {hora}. Su asistencia es muy importante." },
  { id: "general", label: "Aviso general", plantilla: "" },
];
const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t]));
const VARIABLES = ["{nombre}", "{mes_nombre}", "{mes_anio}", "{cuota}", "{monto}", "{meses_mora}", "{total_mora}", "{monto_total}", "{fecha}", "{hora}", "{area}"];
const FILTROS: { id: FiltroDest; label: string }[] = [
  { id: "todos", label: "Todos los residentes" },
  { id: "pendientes", label: "Solo pendientes" },
  { id: "atrasados", label: "Solo atrasados" },
  { id: "unidad", label: "Unidad específica" },
];
const mesNombreActual = () => {
  const d = new Date();
  const s = d.toLocaleDateString("es", { month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const anioActual = () => String(new Date().getFullYear());

function aplicarVars(msg: string, d: Destinatario | undefined): string {
  const reps: [string, string][] = [
    ["{nombre}", d?.nombre ?? "{nombre}"],
    ["{mes_nombre}", mesNombreActual()],
    ["{mes_anio}", anioActual()],
    ["{cuota}", d ? formatCurrency(d.cuota_mensual) : "{cuota}"],
    ["{monto}", d ? formatCurrency(d.saldo) : "{monto}"],
    ["{meses_mora}", d ? String(d.meses_mora) : "{meses_mora}"],
    ["{total_mora}", d ? formatCurrency(d.total_mora) : "{total_mora}"],
    ["{monto_total}", d ? formatCurrency(d.saldo) : "{monto_total}"],
    ["{area}", d?.area != null ? `${d.area} m²` : "{area}"],
  ];
  return reps.reduce((acc, [k, v]) => acc.split(k).join(v), msg);
}

export default function Avisos() {
  const [tab, setTab] = useState<"nuevo" | "historial">("nuevo");
  const [borrador, setBorrador] = useState<{ tipo: TipoAviso; asunto: string; mensaje: string; canal: CanalAviso } | null>(null);

  function cargarBorrador(a: { tipo: TipoAviso; asunto: string | null; mensaje: string; canal: CanalAviso }) {
    setBorrador({ tipo: a.tipo, asunto: a.asunto ?? "", mensaje: a.mensaje, canal: a.canal });
    setTab("nuevo");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Avisos</h1>
        <p className="text-base text-black/50">Recordatorios y comunicados a los residentes</p>
      </div>
      <div className="flex gap-1 border-b-[0.5px] border-black/15">
        <TabBtn active={tab === "nuevo"} onClick={() => setTab("nuevo")}>Nuevo aviso</TabBtn>
        <TabBtn active={tab === "historial"} onClick={() => setTab("historial")}>Historial</TabBtn>
      </div>
      {tab === "nuevo" ? <NuevoAviso borrador={borrador} onUsed={() => setBorrador(null)} /> : <Historial onCargar={cargarBorrador} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`-mb-[0.5px] border-b-2 px-3 py-2 text-base transition-colors ${active ? "border-sidebar-accent font-medium text-ink" : "border-transparent text-black/45 hover:text-ink"}`}>
      {children}
    </button>
  );
}

function NuevoAviso({ borrador, onUsed }: { borrador: { tipo: TipoAviso; asunto: string; mensaje: string; canal: CanalAviso } | null; onUsed: () => void }) {
  const [tipo, setTipo] = useState<TipoAviso>("recordatorio_pago");
  const [filtro, setFiltro] = useState<FiltroDest>("todos");
  const [canal, setCanal] = useState<CanalAviso>("ambos");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState(TIPO["recordatorio_pago"].plantilla);

  useEffect(() => {
    if (borrador) {
      setTipo(borrador.tipo);
      setAsunto(borrador.asunto);
      setMensaje(borrador.mensaje);
      setCanal(borrador.canal);
      onUsed();
    }
  }, [borrador]);
  const [dests, setDests] = useState<Destinatario[]>([]);
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState("");
  const [programar, setProgramar] = useState(false);
  const [programadoAt, setProgramadoAt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [incluirEC, setIncluirEC] = useState(false);

  useEffect(() => {
    getDestinatarios(filtro === "unidad" ? "todos" : filtro)
      .then((r) => setDests(r.destinatarios))
      .catch(() => setDests([]));
  }, [filtro]);

  useEffect(() => {
    if (filtro !== "unidad") {
      setSelIds(new Set(dests.map((d) => d.id_unidad)));
    }
  }, [dests, filtro]);

  function cambiarTipo(t: TipoAviso) {
    const plantillaAnterior = TIPO[tipo].plantilla;
    setTipo(t);
    if (!mensaje.trim() || mensaje === plantillaAnterior) {
      setMensaje(TIPO[t].plantilla);
    }
  }

  function toggleSel(id: string) {
    setSelIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const filtered = destsFiltered;
    const allSelected = filtered.every((d) => selIds.has(d.id_unidad));
    setSelIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((d) => allSelected ? next.delete(d.id_unidad) : next.add(d.id_unidad));
      return next;
    });
  }

  const destsFiltered = dests.filter((d) => {
    if (!buscar.trim()) return true;
    const q = buscar.toLowerCase();
    return (
      (d.numero_propiedad?.toLowerCase().includes(q)) ||
      d.nombre.toLowerCase().includes(q) ||
      d.id_unidad.toLowerCase().includes(q)
    );
  });

  const selectedDests = dests.filter((d) => selIds.has(d.id_unidad));

  async function enviar(borrador: boolean) {
    setError(null);
    setMsg(null);
    setSaving(true);
    try {
      const r = await createAviso({
        tipo,
        asunto: asunto.trim() || undefined,
        mensaje,
        canal,
        filtro: filtro === "unidad" ? "todos" : filtro,
        id_unidades: filtro === "unidad" || selIds.size < dests.length ? [...selIds] : undefined,
        programado_at: programar && programadoAt ? new Date(programadoAt).toISOString() : undefined,
        guardar_borrador: borrador,
        incluir_estado_cuenta: incluirEC || undefined,
      });
      setMsg(
        borrador ? "Aviso guardado como borrador."
        : r.estado === "programado" ? `Aviso programado para ${formatDate(r.programado_at)}.`
        : `Aviso registrado para ${r.total_envios} destinatario(s). El despacho por ${canal} se enviará al conectar el canal.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el aviso");
    } finally {
      setSaving(false);
    }
  }

  const primero = selectedDests[0];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {msg && <div className="rounded-md border-[0.5px] border-estado-pagado/30 bg-estado-pagado/10 p-3 text-base text-estado-pagado">{msg}</div>}
        {error && <div className="rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-3 text-base text-estado-atrasado">{error}</div>}

        <Panel title="Tipo y canal">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Tipo de aviso</span>
              <select value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoAviso)} className={`${inputCls} mt-1`}>
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Canal</span>
              <select value={canal} onChange={(e) => setCanal(e.target.value as CanalAviso)} className={`${inputCls} mt-1`}>
                <option value="ambos">WhatsApp + Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </label>
          </div>
        </Panel>

        <Panel title="Propiedades destinatarias">
          <div className="mb-3 flex items-center justify-between gap-3">
            <select value={filtro} onChange={(e) => { setFiltro(e.target.value as FiltroDest); setSelIds(new Set()); }} className={`${inputCls} w-52`}>
              {FILTROS.filter((f) => f.id !== "unidad").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              <option value="unidad">Selección manual</option>
            </select>
            <span className="whitespace-nowrap rounded-md bg-sidebar-accent/10 px-3 py-2 text-base font-medium text-sidebar-accent">
              <IconHome size={14} className="mr-1 inline" />{selIds.size} seleccionadas
            </span>
          </div>
          <div className="relative mb-3">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar por número de propiedad o nombre del propietario…"
              className={`${inputCls} py-2.5 pl-9 text-base`}
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border-[0.5px] border-black/10">
            <table className="w-full text-tabla">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                  <th className="py-1.5 pl-3 font-medium">
                    <input
                      type="checkbox"
                      checked={destsFiltered.length > 0 && destsFiltered.every((d) => selIds.has(d.id_unidad))}
                      onChange={toggleAll}
                      className="accent-sidebar-accent"
                    />
                  </th>
                  <th className="py-1.5 font-medium">Propiedad</th>
                  <th className="py-1.5 font-medium">Propietario</th>
                  <th className="py-1.5 text-right font-medium">Saldo</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Mora</th>
                </tr>
              </thead>
              <tbody>
                {destsFiltered.map((d) => (
                  <tr
                    key={d.id_unidad}
                    onClick={() => filtro === "unidad" && toggleSel(d.id_unidad)}
                    className={`border-b-[0.5px] border-black/5 transition-colors ${filtro === "unidad" ? "cursor-pointer hover:bg-black/3" : ""} ${selIds.has(d.id_unidad) ? "bg-sidebar-accent/5" : ""}`}
                  >
                    <td className="py-1.5 pl-3">
                      <input
                        type="checkbox"
                        checked={selIds.has(d.id_unidad)}
                        onChange={() => toggleSel(d.id_unidad)}
                        disabled={filtro !== "unidad"}
                        className="accent-sidebar-accent"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="py-1.5 font-mono font-medium">{d.numero_propiedad ?? d.id_unidad}</td>
                    <td className="py-1.5 text-black/70">{d.nombre}</td>
                    <td className="py-1.5 text-right font-mono">{formatCurrency(d.saldo)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {d.meses_mora > 0 ? (
                        <span className="rounded-full bg-estado-atrasado/12 px-2 py-0.5 text-etiqueta font-medium text-estado-atrasado">
                          {d.meses_mora} mes{d.meses_mora > 1 ? "es" : ""}
                        </span>
                      ) : (
                        <span className="text-etiqueta text-black/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {destsFiltered.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-base text-black/40">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Mensaje">
          {(canal === "email" || canal === "ambos") && (
            <label className="mb-3 block">
              <span className={labelCls}>Asunto (email)</span>
              <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
          )}
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={5} className={`${inputCls} font-sans`} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <button key={v} type="button" onClick={() => setMensaje((m) => m + " " + v)} className="rounded-full bg-black/5 px-2 py-0.5 font-mono text-etiqueta text-black/55 hover:bg-black/10">
                {v}
              </button>
            ))}
          </div>
          {(canal === "email" || canal === "ambos") && (
            <label className="mt-3 flex items-center gap-2 text-base cursor-pointer">
              <input type="checkbox" checked={incluirEC} onChange={(e) => setIncluirEC(e.target.checked)} className="accent-sidebar-accent" />
              Incluir estado de cuenta en el correo
            </label>
          )}
        </Panel>

        <Panel title="Programación">
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={programar} onChange={(e) => setProgramar(e.target.checked)} />
            Programar para más tarde
          </label>
          {programar && (
            <input type="datetime-local" value={programadoAt} onChange={(e) => setProgramadoAt(e.target.value)} className={`${inputCls} mt-2 w-64`} />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => enviar(true)} disabled={saving}>
              <IconDeviceFloppy size={16} /> Guardar borrador
            </Button>
            <Button onClick={() => enviar(false)} disabled={saving || selIds.size === 0}>
              <IconSend size={16} /> {programar ? "Programar" : "Enviar"}
            </Button>
          </div>
        </Panel>
      </div>

      {/* Vista previa */}
      <div>
        <Panel title="Vista previa">
          <div className="mb-2 flex items-center gap-2 text-etiqueta uppercase tracking-wide text-black/45">
            {canal === "email" ? <IconMail size={16} /> : <IconBrandWhatsapp size={16} />}
            {canal === "ambos" ? "WhatsApp + Email" : canal}
            {primero ? ` · ${primero.numero_propiedad ?? primero.id_unidad} · ${primero.nombre}` : ""}
          </div>
          {canal === "email" ? (
            <div className="rounded-lg border-[0.5px] border-black/15">
              <div className="border-b-[0.5px] border-black/10 px-3 py-2 text-base">
                <div className="font-medium">{asunto || "(sin asunto)"}</div>
                <div className="text-etiqueta text-black/45">para: {primero?.email ?? "—"}</div>
              </div>
              <div className="whitespace-pre-wrap p-3 text-base">{aplicarVars(mensaje, primero)}</div>
            </div>
          ) : (
            <div className="rounded-lg bg-[#e6f5e9] p-3">
              <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-white p-2.5 text-base shadow-sm">
                {aplicarVars(mensaje, primero)}
              </div>
              <div className="mt-1 text-right text-etiqueta text-black/40">{primero?.telefono ?? "—"}</div>
            </div>
          )}
          <p className="mt-3 text-etiqueta uppercase tracking-wide text-black/35">
            Las variables se reemplazan por cada destinatario al enviar.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Historial({ onCargar }: { onCargar: (a: { tipo: TipoAviso; asunto: string | null; mensaje: string; canal: CanalAviso }) => void }) {
  const [data, setData] = useState<AvisosHistorial | null>(null);
  useEffect(() => { getAvisos().then(setData).catch(() => {}); }, []);
  if (!data) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        <Stat label="Total enviados" value={String(data.stats.total_enviados)} />
        <Stat label="Tasa de entrega" value={`${data.stats.tasa_entrega}%`} />
        <Stat label="Tasa de apertura" value={`${data.stats.tasa_apertura}%`} />
      </div>
      <Panel title="Avisos">
        {data.avisos.length === 0 ? (
          <EmptyState icon={<IconSend size={26} stroke={1.5} />} title="Sin avisos registrados" />
        ) : (
          <table className="w-full text-tabla">
            <thead>
              <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                <th className="py-1.5 font-medium">Tipo</th>
                <th className="py-1.5 font-medium">Asunto</th>
                <th className="py-1.5 font-medium">Canal</th>
                <th className="py-1.5 text-right font-medium">Envíos</th>
                <th className="py-1.5 font-medium">Estado</th>
                <th className="py-1.5 font-medium">Fecha</th>
                <th className="py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.avisos.map((a) => (
                <tr key={a.id} className="border-b-[0.5px] border-black/5">
                  <td className="py-2">{TIPO[a.tipo]?.label ?? a.tipo}</td>
                  <td className="py-2 text-black/60">{a.asunto ?? "—"}</td>
                  <td className="py-2 capitalize">{a.canal}</td>
                  <td className="py-2 text-right font-mono">{a.total_envios}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${a.estado === "enviado" ? "bg-estado-pagado/12 text-estado-pagado" : a.estado === "programado" ? "bg-estado-pendiente/15 text-estado-pendiente" : "bg-black/5 text-black/45"}`}>
                      {a.estado}
                    </span>
                  </td>
                  <td className="py-2 font-mono text-black/60">{formatDate(a.enviado_at ?? a.created_at)}</td>
                  <td className="py-2 text-right">
                    {a.estado === "borrador" && (
                      <button
                        onClick={() => onCargar({ tipo: a.tipo as TipoAviso, asunto: a.asunto, mensaje: a.mensaje, canal: a.canal as CanalAviso })}
                        className="rounded-md bg-sidebar-accent/10 px-2.5 py-1 text-etiqueta font-medium text-sidebar-accent hover:bg-sidebar-accent/20 transition"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border-[0.5px] border-black/15 bg-white p-3.5">
      <div className="mb-1 text-etiqueta uppercase tracking-wide text-black/45">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}
