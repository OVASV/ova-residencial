import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IconBrandWhatsapp, IconPhonePlus, IconSearch, IconAlertTriangle, IconHistory, IconMail } from "@tabler/icons-react";
import {
  getCobranza,
  registrarGestion,
  getGestiones,
  enviarCobranzaEmail,
  type CobranzaData,
  type CobranzaItem,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import MonoAmount from "../../components/ui/MonoAmount";
import { inputCls, labelCls } from "../../components/ui/form";
import { formatCurrency, formatDate } from "../../utils/formatters";

const PRIO_BADGE: Record<string, string> = {
  alta: "bg-estado-atrasado/12 text-estado-atrasado",
  media: "bg-estado-pendiente/15 text-estado-pendiente",
  baja: "bg-black/5 text-black/50",
};
const RESULTADO_LABEL: Record<string, string> = {
  contactado: "Contactado",
  promesa_pago: "Promesa de pago",
  sin_respuesta: "Sin respuesta",
  numero_erroneo: "Número erróneo",
  mensaje_enviado: "WhatsApp enviado",
  otro: "Otro",
};

function waLink(telefono: string | null, mensaje: string): string | null {
  if (!telefono) return null;
  const num = telefono.replace(/[^\d]/g, "");
  if (num.length < 8) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

export default function Cobranza() {
  const [data, setData] = useState<CobranzaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [prio, setPrio] = useState<"" | "alta" | "media" | "baja">("");
  const [buscar, setBuscar] = useState("");
  const [gestion, setGestion] = useState<CobranzaItem | null>(null);
  const [historial, setHistorial] = useState<CobranzaItem | null>(null);
  const [email, setEmail] = useState<CobranzaItem | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    setLoading(true);
    getCobranza().then(setData).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => load(), []);

  // Al enviar WhatsApp manual, deja registro de la gestión (con el usuario actual).
  function enviarWhatsapp(x: CobranzaItem) {
    registrarGestion({
      id_unidad: x.id_unidad,
      canal: "whatsapp",
      resultado: "mensaje_enviado",
      nota: "Recordatorio enviado por WhatsApp",
      saldo_al_momento: x.saldo,
    })
      .then(() => {
        setMsg("WhatsApp registrado en el historial");
        setTimeout(() => setMsg(null), 3000);
        load();
      })
      .catch(() => {});
  }

  const items = useMemo(() => {
    const arr = data?.items ?? [];
    const q = buscar.trim().toLowerCase();
    return arr.filter((x) => {
      if (prio && x.prioridad !== prio) return false;
      if (q && !(x.numero_propiedad?.toLowerCase().includes(q) || x.propietario?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data, prio, buscar]);

  // Promesas de pago activas (aún deben) ordenadas por fecha prometida.
  const hoy = new Date().toISOString().slice(0, 10);
  const promesas = useMemo(() => {
    return (data?.items ?? [])
      .filter((x) => x.promesa)
      .map((x) => ({ item: x, fecha: x.promesa!.promesa_fecha.slice(0, 10) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [data]);

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Cobranza</h1>
          <p className="text-base text-black/50">A quién contactar — morosos priorizados por monto adeudado</p>
        </div>
        <Link to="/cobranza/bitacora" className="inline-flex items-center gap-1 rounded-md bg-black/5 px-3 py-1.5 text-etiqueta font-medium text-black/60 hover:bg-black/10">
          <IconHistory size={15} /> Bitácora de gestiones
        </Link>
      </div>

      {msg && <div className="rounded-md border-[0.5px] border-estado-pagado/30 bg-estado-pagado/10 p-3 text-base text-estado-pagado">{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Morosos" value={String(data?.total_morosos ?? 0)} />
        <Kpi label="Deuda total" value={formatCurrency(data?.total_deuda ?? 0)} tone="text-estado-atrasado" />
        <Kpi label="Prioridad alta" value={String(data?.por_prioridad.alta ?? 0)} tone="text-estado-atrasado" />
        <Kpi label="Prioridad media" value={String(data?.por_prioridad.media ?? 0)} tone="text-estado-pendiente" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Prioridad</label>
          <select value={prio} onChange={(e) => setPrio(e.target.value as any)} className={`${inputCls} w-40`}>
            <option value="">Todas</option>
            <option value="alta">Alta (≥ $500)</option>
            <option value="media">Media ($100–500)</option>
            <option value="baja">Baja (&lt; $100)</option>
          </select>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <label className="mb-0.5 block text-etiqueta text-black/40">Buscar</label>
          <IconSearch size={14} className="absolute left-2.5 bottom-2.5 text-black/30" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Propiedad o propietario…" className={`${inputCls} pl-8`} />
        </div>
      </div>

      {promesas.length > 0 && (
        <Panel title={`Promesas de pago (${promesas.length})`}>
          <ul className="divide-y divide-black/5">
            {promesas.map(({ item: x, fecha }) => {
              const estado = fecha < hoy ? "vencida" : fecha === hoy ? "hoy" : "proxima";
              const badge =
                estado === "vencida" ? "bg-estado-atrasado/12 text-estado-atrasado"
                : estado === "hoy" ? "bg-estado-pendiente/15 text-estado-pendiente"
                : "bg-sidebar-accent/10 text-sidebar-accent";
              const texto = estado === "vencida" ? "Venció — no pagó" : estado === "hoy" ? "Vence hoy" : "Próxima";
              return (
                <li key={x.id_unidad} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <span className="font-mono font-medium">{x.numero_propiedad ?? x.id_unidad}</span>
                    {x.propietario && <span className="text-black/60"> · {x.propietario}</span>}
                    <div className="text-etiqueta text-black/45">Prometió pagar el {formatDate(fecha)} · saldo <MonoAmount value={x.saldo} className="text-estado-atrasado" /></div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${badge}`}>{texto}</span>
                    <button onClick={() => setGestion(x)} className="inline-flex items-center gap-1 rounded-md bg-sidebar-accent/10 px-2 py-1 text-etiqueta font-medium text-sidebar-accent hover:bg-sidebar-accent/20">
                      <IconPhonePlus size={14} /> Gestión
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel title={`Morosos (${items.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-tabla">
            <thead>
              <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                <th className="py-1.5 font-medium">Prioridad</th>
                <th className="py-1.5 font-medium"># Propiedad</th>
                <th className="py-1.5 font-medium">Propietario</th>
                <th className="py-1.5 text-right font-medium">Saldo</th>
                <th className="py-1.5 font-medium">Última gestión</th>
                <th className="py-1.5 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => {
                const mensaje = `Hola ${x.propietario ?? ""}, le recordamos que su cuota en El Mirador presenta un saldo pendiente de ${formatCurrency(x.saldo)}. Agradecemos su pronto pago.`;
                const wa = waLink(x.telefono, mensaje);
                return (
                  <tr key={x.id_unidad} className="border-b-[0.5px] border-black/5">
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${PRIO_BADGE[x.prioridad]}`}>{x.prioridad}</span>
                    </td>
                    <td className="py-2 font-mono font-medium">{x.numero_propiedad ?? x.id_unidad}</td>
                    <td className="py-2">
                      {x.propietario ?? <span className="text-black/35">—</span>}
                      {x.telefono && <div className="text-etiqueta text-black/40">{x.telefono}</div>}
                    </td>
                    <td className="py-2 text-right"><MonoAmount value={x.saldo} className="font-semibold text-estado-atrasado" /></td>
                    <td className="py-2">
                      {x.ultima_gestion ? (
                        <button onClick={() => setHistorial(x)} className="text-left text-etiqueta hover:underline" title="Ver historial">
                          <span className="text-black/70">{RESULTADO_LABEL[x.ultima_gestion.resultado] ?? x.ultima_gestion.resultado}</span>
                          <span className="text-black/40"> · {formatDate(x.ultima_gestion.fecha)}</span>
                          {x.ultima_gestion.promesa_fecha && (
                            <div className="text-sidebar-accent">Promete: {formatDate(x.ultima_gestion.promesa_fecha)}</div>
                          )}
                        </button>
                      ) : (
                        <span className="text-etiqueta text-black/30">Sin gestión</span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => enviarWhatsapp(x)}
                            className="inline-flex items-center gap-1 rounded-md bg-[#25D366]/12 px-2 py-1 text-etiqueta font-medium text-[#128C4B] hover:bg-[#25D366]/20"
                            title="Enviar WhatsApp (se registra la gestión)"
                          >
                            <IconBrandWhatsapp size={14} /> WhatsApp
                          </a>
                        ) : (
                          <span className="text-etiqueta text-black/25">sin tel.</span>
                        )}
                        <button
                          onClick={() => setEmail(x)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#4A90D9]/12 px-2 py-1 text-etiqueta font-medium text-[#2E6DA4] hover:bg-[#4A90D9]/20"
                          title="Enviar correo (se registra la gestión)"
                        >
                          <IconMail size={14} /> Email
                        </button>
                        <button
                          onClick={() => setGestion(x)}
                          className="inline-flex items-center gap-1 rounded-md bg-sidebar-accent/10 px-2 py-1 text-etiqueta font-medium text-sidebar-accent hover:bg-sidebar-accent/20"
                          title="Registrar gestión"
                        >
                          <IconPhonePlus size={14} /> Gestión
                        </button>
                        <button
                          onClick={() => setHistorial(x)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-etiqueta font-medium ${
                            x.ultima_gestion
                              ? "bg-sidebar-accent/15 text-sidebar-accent hover:bg-sidebar-accent/25"
                              : "bg-black/5 text-black/40 hover:bg-black/10"
                          }`}
                          title={x.ultima_gestion ? "Ver historial de gestiones (con acciones)" : "Sin gestiones registradas"}
                        >
                          <IconHistory size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-base text-black/40">Sin morosos con estos filtros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {gestion && (
        <GestionModal
          item={gestion}
          onClose={() => setGestion(null)}
          onSaved={() => {
            setGestion(null);
            setMsg("Gestión registrada");
            setTimeout(() => setMsg(null), 3000);
            load();
          }}
        />
      )}

      {historial && <HistorialModal item={historial} onClose={() => setHistorial(null)} />}

      {email && (
        <EmailModal
          item={email}
          onClose={() => setEmail(null)}
          onSent={() => {
            setEmail(null);
            setMsg("Correo enviado y registrado");
            setTimeout(() => setMsg(null), 3000);
            load();
          }}
        />
      )}
    </div>
  );
}

function EmailModal({ item, onClose, onSent }: { item: CobranzaItem; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState(item.email ?? "");
  const [asunto, setAsunto] = useState("Recordatorio de pago — El Mirador");
  const [cuerpo, setCuerpo] = useState(
    `Estimado/a ${item.propietario ?? ""},\n\nLe recordamos que su cuenta en El Mirador presenta un saldo pendiente de ${formatCurrency(item.saldo)}. Le agradecemos regularizar su pago a la brevedad.\n\nSaludos cordiales,\nAdministración`
  );
  const [guardar, setGuardar] = useState(!item.email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el correo cambia respecto al de la ficha, sugerir guardarlo.
  const distinto = to.trim().toLowerCase() !== (item.email ?? "").trim().toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await enviarCobranzaEmail({ id_unidad: item.id_unidad, to: to.trim(), asunto: asunto.trim(), cuerpo, saldo_al_momento: item.saldo, guardar_email: guardar && distinto });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Correo — ${item.numero_propiedad ?? item.id_unidad}`} onClose={onClose} width="max-w-lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="flex items-center gap-1.5 text-base text-estado-atrasado"><IconAlertTriangle size={15} /> {error}</div>}
        <label className="block">
          <span className={labelCls}>Para</span>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="correo@propietario.com" required className={`${inputCls} mt-1`} />
          {!item.email && <span className="text-etiqueta text-estado-pendiente">Esta propiedad no tiene correo en la base — ingrésalo manualmente.</span>}
        </label>
        {distinto && to.trim() && (
          <label className="flex items-center gap-2 text-base cursor-pointer">
            <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} className="accent-sidebar-accent" />
            Guardar este correo en la ficha del propietario
          </label>
        )}
        <label className="block">
          <span className={labelCls}>Asunto</span>
          <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="block">
          <span className={labelCls}>Mensaje</span>
          <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={7} className={`${inputCls} mt-1`} />
        </label>
        <p className="text-etiqueta text-black/40">El correo se envía desde la cuenta de la empresa configurada en Configuración → Email.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving || !to.trim() || !cuerpo.trim()}>{saving ? "Enviando…" : "Enviar correo"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function HistorialModal({ item, onClose }: { item: CobranzaItem; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getGestiones>> | null>(null);
  useEffect(() => {
    getGestiones(item.id_unidad).then(setData).catch(() => setData([]));
  }, [item.id_unidad]);

  return (
    <Modal title={`Historial — ${item.numero_propiedad ?? item.id_unidad}`} onClose={onClose} width="max-w-lg">
      <div className="mb-3 rounded-md border-[0.5px] border-black/10 bg-black/[0.02] px-3 py-2 text-base text-black/60">
        {item.propietario ?? "—"} · Saldo actual <MonoAmount value={item.saldo} className="font-semibold text-estado-atrasado" />
      </div>
      {!data ? (
        <div className="py-6 text-center text-base text-black/40">Cargando…</div>
      ) : data.length === 0 ? (
        <div className="py-6 text-center text-base text-black/40">Sin gestiones registradas</div>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {data.map((g) => (
            <li key={g.id} className="rounded-md border-[0.5px] border-black/10 p-3">
              <div className="flex items-center justify-between">
                <span className="text-base font-medium">
                  {RESULTADO_LABEL[g.resultado] ?? g.resultado}
                  <span className="ml-2 rounded-full bg-black/5 px-1.5 py-0.5 text-etiqueta uppercase text-black/50">{g.canal}</span>
                </span>
                <span className="text-etiqueta text-black/45">{formatDate(g.fecha)}</span>
              </div>
              {g.promesa_fecha && <div className="mt-0.5 text-etiqueta text-sidebar-accent">Prometió pagar el {formatDate(g.promesa_fecha)}</div>}
              {g.nota && <div className="mt-1 text-base text-black/65">{g.nota}</div>}
              <div className="mt-1 text-etiqueta text-black/35">
                {g.saldo_al_momento != null && <>Saldo en ese momento: {formatCurrency(Number(g.saldo_al_momento))} · </>}
                {g.registrado_por ?? "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function GestionModal({ item, onClose, onSaved }: { item: CobranzaItem; onClose: () => void; onSaved: () => void }) {
  const [canal, setCanal] = useState("llamada");
  const [resultado, setResultado] = useState("contactado");
  const [promesaFecha, setPromesaFecha] = useState("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await registrarGestion({
        id_unidad: item.id_unidad,
        canal,
        resultado,
        promesa_fecha: resultado === "promesa_pago" && promesaFecha ? promesaFecha : undefined,
        nota: nota.trim() || undefined,
        saldo_al_momento: item.saldo,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Gestión — ${item.numero_propiedad ?? item.id_unidad}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="flex items-center gap-1.5 text-base text-estado-atrasado"><IconAlertTriangle size={15} /> {error}</div>}
        <div className="rounded-md border-[0.5px] border-black/10 bg-black/[0.02] px-3 py-2 text-base text-black/60">
          {item.propietario ?? "—"} · Saldo <MonoAmount value={item.saldo} className="font-semibold text-estado-atrasado" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Canal</span>
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className={`${inputCls} mt-1`}>
              <option value="llamada">Llamada</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="visita">Visita</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Resultado</span>
            <select value={resultado} onChange={(e) => setResultado(e.target.value)} className={`${inputCls} mt-1`}>
              <option value="contactado">Contactado</option>
              <option value="promesa_pago">Promesa de pago</option>
              <option value="sin_respuesta">Sin respuesta</option>
              <option value="numero_erroneo">Número erróneo</option>
              <option value="otro">Otro</option>
            </select>
          </label>
        </div>
        {resultado === "promesa_pago" && (
          <label className="block">
            <span className={labelCls}>Fecha prometida de pago</span>
            <input type="date" value={promesaFecha} onChange={(e) => setPromesaFecha(e.target.value)} className={`${inputCls} mt-1 w-48`} />
          </label>
        )}
        <label className="block">
          <span className={labelCls}>Nota</span>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Detalle de la gestión…" className={`${inputCls} mt-1`} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Registrar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Kpi({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border-[0.5px] border-black/15 bg-white p-3.5 shadow-sm">
      <div className="mb-1 text-etiqueta uppercase tracking-wide text-black/45">{label}</div>
      <div className={`font-mono text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
