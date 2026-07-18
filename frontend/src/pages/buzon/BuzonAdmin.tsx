import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconClock, IconSend, IconFilter } from "@tabler/icons-react";
import { getMensajesAdmin, responderMensaje, type MensajeAdmin } from "../../api/client";
import { useAuth } from "../../stores/authStore";
import Panel from "../../components/ui/Panel";
import { formatDate } from "../../utils/formatters";
import { inputCls } from "../../components/ui/form";

const CAT_LABEL: Record<string, string> = {
  mantenimiento: "Mantenimiento",
  seguridad: "Seguridad",
  convivencia: "Convivencia",
  pagos: "Pagos y cobros",
  infraestructura: "Infraestructura",
  sugerencia: "Sugerencia",
};

export default function BuzonAdmin() {
  const canReply = ["superadmin", "admin", "directiva"].includes(useAuth((s) => s.user?.rol) ?? "");
  const [mensajes, setMensajes] = useState<MensajeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [sending, setSending] = useState(false);

  // Filtros
  const [fAnio, setFAnio] = useState("");
  const [fMes, setFMes] = useState("");
  const [fCat, setFCat] = useState("");
  const [fProp, setFProp] = useState("");

  useEffect(() => {
    getMensajesAdmin().then(setMensajes).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const anios = useMemo(() => {
    const set = new Set(mensajes.map((m) => new Date(m.fecha).getFullYear()));
    return [...set].sort((a, b) => b - a);
  }, [mensajes]);

  const propietarios = useMemo(() => {
    const set = new Set(mensajes.map((m) => m.nombre_usuario));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [mensajes]);

  const MESES = [
    { v: "1", l: "Enero" }, { v: "2", l: "Febrero" }, { v: "3", l: "Marzo" },
    { v: "4", l: "Abril" }, { v: "5", l: "Mayo" }, { v: "6", l: "Junio" },
    { v: "7", l: "Julio" }, { v: "8", l: "Agosto" }, { v: "9", l: "Septiembre" },
    { v: "10", l: "Octubre" }, { v: "11", l: "Noviembre" }, { v: "12", l: "Diciembre" },
  ];

  const filtrados = useMemo(() => {
    return mensajes.filter((m) => {
      const d = new Date(m.fecha);
      if (fAnio && d.getFullYear() !== Number(fAnio)) return false;
      if (fMes && d.getMonth() + 1 !== Number(fMes)) return false;
      if (fCat && m.categoria !== fCat) return false;
      if (fProp && m.nombre_usuario !== fProp) return false;
      return true;
    });
  }, [mensajes, fAnio, fMes, fCat, fProp]);

  const hayFiltros = !!(fAnio || fMes || fCat || fProp);

  async function onResponder(id: string) {
    if (!respuesta.trim()) return;
    setSending(true);
    try {
      await responderMensaje(id, respuesta.trim());
      const updated = await getMensajesAdmin();
      setMensajes(updated);
      setReplyId(null);
      setRespuesta("");
    } catch { /* */ }
    setSending(false);
  }

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  const pendientes = filtrados.filter((m) => m.respuestas.length === 0);
  const respondidos = filtrados.filter((m) => m.respuestas.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Notificaciones</h1>
        <p className="text-base text-black/50">Consultas y quejas de propietarios</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <IconFilter size={16} className="mb-2 text-black/30" />
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Año</label>
          <select value={fAnio} onChange={(e) => setFAnio(e.target.value)} className={`${inputCls} w-24`}>
            <option value="">Todos</option>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Mes</label>
          <select value={fMes} onChange={(e) => setFMes(e.target.value)} className={`${inputCls} w-32`}>
            <option value="">Todos</option>
            {MESES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Categoría</label>
          <select value={fCat} onChange={(e) => setFCat(e.target.value)} className={`${inputCls} w-36`}>
            <option value="">Todas</option>
            {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Propietario</label>
          <select value={fProp} onChange={(e) => setFProp(e.target.value)} className={`${inputCls} w-40`}>
            <option value="">Todos</option>
            {propietarios.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {hayFiltros && (
          <button
            onClick={() => { setFAnio(""); setFMes(""); setFCat(""); setFProp(""); }}
            className="mb-0.5 rounded-md px-2 py-1.5 text-etiqueta text-black/50 hover:bg-black/5"
          >
            Limpiar
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-lg border-[0.5px] border-black/10 bg-white p-8 text-center text-black/40">
          {hayFiltros ? "No hay mensajes con los filtros seleccionados" : "No hay mensajes"}
        </div>
      ) : (
        <>
          {pendientes.length > 0 && (
            <Panel title={`Pendientes (${pendientes.length})`}>
              <div className="space-y-3">
                {pendientes.map((m) => (
                  <MensajeCard
                    key={m.id}
                    m={m}
                    isReply={canReply && replyId === m.id}
                    respuesta={respuesta}
                    sending={sending}
                    onOpenReply={canReply ? () => { setReplyId(m.id); setRespuesta(""); } : undefined}
                    onChangeReply={setRespuesta}
                    onSubmit={() => onResponder(m.id)}
                    onCancel={() => setReplyId(null)}
                  />
                ))}
              </div>
            </Panel>
          )}

          {respondidos.length > 0 && (
            <Panel title={`Respondidos (${respondidos.length})`}>
              <div className="space-y-3">
                {respondidos.map((m) => (
                  <MensajeCard
                    key={m.id}
                    m={m}
                    isReply={canReply && replyId === m.id}
                    respuesta={respuesta}
                    sending={sending}
                    onOpenReply={canReply ? () => { setReplyId(m.id); setRespuesta(""); } : undefined}
                    onChangeReply={setRespuesta}
                    onSubmit={() => onResponder(m.id)}
                    onCancel={() => setReplyId(null)}
                  />
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

interface CardProps {
  m: MensajeAdmin;
  isReply?: boolean;
  respuesta?: string;
  sending?: boolean;
  onOpenReply?: () => void;
  onChangeReply?: (v: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
}

function MensajeCard({ m, isReply, respuesta, sending, onOpenReply, onChangeReply, onSubmit, onCancel }: CardProps) {
  return (
    <div className="rounded-md border-[0.5px] border-black/8 bg-black/[0.01] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-semibold text-base">{m.asunto}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="rounded-full bg-[#085041]/10 px-2 py-0.5 text-etiqueta font-medium text-[#085041]">
              {CAT_LABEL[m.categoria] ?? m.categoria}
            </span>
            <span className="text-etiqueta text-black/40">
              {m.nombre_usuario}{m.numero_propiedad ? ` · #${m.numero_propiedad}` : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-etiqueta shrink-0">
          {m.respuestas.length > 0 ? (
            <span className="flex items-center gap-0.5 text-estado-pagado"><IconCheck size={14} /> Respondido</span>
          ) : (
            <span className="flex items-center gap-0.5 text-black/40"><IconClock size={14} /> Pendiente</span>
          )}
        </div>
      </div>
      <p className="mt-2 text-base text-black/70 whitespace-pre-wrap">{m.mensaje}</p>
      <div className="mt-1 text-etiqueta text-black/30">{formatDate(m.fecha)}</div>

      {m.respuestas.length > 0 && (
        <div className="mt-3 space-y-2">
          {m.respuestas.map((r) => (
            <div key={r.id} className="rounded-md border-l-2 border-[#085041] bg-[#085041]/5 p-3">
              <div className="text-etiqueta font-medium text-[#085041] mb-1">Respondido por {r.nombre_usuario}</div>
              <p className="text-base text-black/70 whitespace-pre-wrap">{r.texto}</p>
              <div className="mt-1 text-etiqueta text-black/30">{formatDate(r.fecha)}</div>
            </div>
          ))}
        </div>
      )}

      {!isReply && onOpenReply && (
        <button onClick={onOpenReply} className="mt-2 rounded-md bg-[#085041] px-3 py-1 text-etiqueta font-medium text-white hover:bg-[#063d32]">
          {m.respuestas.length > 0 ? "Agregar respuesta" : "Responder"}
        </button>
      )}

      {isReply && onChangeReply && onSubmit && onCancel && (
        <div className="mt-3 space-y-2">
          <textarea
            value={respuesta}
            onChange={(e) => onChangeReply(e.target.value)}
            className={inputCls}
            rows={3}
            placeholder="Escribe tu respuesta…"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={onSubmit} disabled={sending} className="flex items-center gap-1 rounded-md bg-[#085041] px-3 py-1 text-etiqueta font-medium text-white hover:bg-[#063d32] disabled:opacity-50">
              <IconSend size={14} /> {sending ? "Enviando…" : "Enviar respuesta"}
            </button>
            <button onClick={onCancel} className="rounded-md border-[0.5px] border-black/15 px-3 py-1 text-etiqueta text-black/60 hover:bg-black/5">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
