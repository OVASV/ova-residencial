import { useEffect, useState } from "react";
import { IconSend, IconCheck, IconClock } from "@tabler/icons-react";
import { getMisMensajes, getMisUnidades, crearMensaje, type MensajePortal, type MiUnidad } from "../../api/client";
import Panel from "../../components/ui/Panel";
import { formatDate } from "../../utils/formatters";
import { inputCls } from "../../components/ui/form";

const CATEGORIAS = [
  { value: "mantenimiento", label: "Mantenimiento", desc: "Áreas comunes dañadas, luminarias, portón, bomba de agua, jardines" },
  { value: "seguridad", label: "Seguridad", desc: "Accesos, vigilancia, incidentes, cámaras" },
  { value: "convivencia", label: "Convivencia", desc: "Ruido, mascotas, estacionamiento indebido, uso de áreas comunes" },
  { value: "pagos", label: "Pagos y cobros", desc: "Dudas sobre cuotas, cargos incorrectos, recibos" },
  { value: "infraestructura", label: "Infraestructura", desc: "Calles internas, drenajes, muros perimetrales, aceras" },
  { value: "sugerencia", label: "Sugerencia", desc: "Propuestas de mejora o servicios nuevos" },
];

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

export default function MisMensajes() {
  const [mensajes, setMensajes] = useState<MensajePortal[]>([]);
  const [unidades, setUnidades] = useState<MiUnidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [categoria, setCategoria] = useState("");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [idUnidad, setIdUnidad] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    Promise.all([getMisMensajes(), getMisUnidades()])
      .then(([m, u]) => { setMensajes(m); setUnidades(u); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const catSeleccionada = CATEGORIAS.find((c) => c.value === categoria);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoria || !asunto.trim() || !mensaje.trim()) return;
    setSending(true);
    try {
      await crearMensaje({ categoria, asunto: asunto.trim(), mensaje: mensaje.trim(), id_unidad: idUnidad || undefined });
      const updated = await getMisMensajes();
      setMensajes(updated);
      setCategoria(""); setAsunto(""); setMensaje(""); setIdUnidad(""); setShowForm(false);
    } catch { /* */ }
    setSending(false);
  }

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Mensajes</h1>
          <p className="text-base text-black/50">Envía consultas o quejas a la administración</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-[#085041] px-4 py-1.5 text-base font-medium text-white hover:bg-[#063d32]"
          >
            Nuevo mensaje
          </button>
        )}
      </div>

      {showForm && (
        <Panel title="Nuevo mensaje">
          <form onSubmit={onSubmit} className="space-y-3">
            {/* Categoría */}
            <div>
              <label className="mb-1 block text-etiqueta font-medium text-black/50">Categoría</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls} required>
                <option value="">— Selecciona una categoría —</option>
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {catSeleccionada && (
                <p className="mt-1.5 rounded-md bg-[#085041]/5 px-3 py-2 text-etiqueta text-[#085041]">
                  {catSeleccionada.desc}
                </p>
              )}
            </div>

            {/* Unidad */}
            {unidades.length > 1 && (
              <div>
                <label className="mb-1 block text-etiqueta font-medium text-black/50">Unidad (opcional)</label>
                <select value={idUnidad} onChange={(e) => setIdUnidad(e.target.value)} className={inputCls}>
                  <option value="">— General —</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>#{u.numero_propiedad ?? u.id}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Asunto */}
            <div>
              <label className="mb-1 block text-etiqueta font-medium text-black/50">Asunto</label>
              <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={inputCls} placeholder="Asunto del mensaje" required />
            </div>

            {/* Mensaje */}
            <div>
              <label className="mb-1 block text-etiqueta font-medium text-black/50">Mensaje</label>
              <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} className={inputCls} rows={4} placeholder="Describe tu consulta o queja…" required />
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={sending} className="flex items-center gap-1.5 rounded-md bg-[#085041] px-4 py-1.5 text-base font-medium text-white hover:bg-[#063d32] disabled:opacity-50">
                <IconSend size={16} /> {sending ? "Enviando…" : "Enviar"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border-[0.5px] border-black/15 px-4 py-1.5 text-base text-black/60 hover:bg-black/5">
                Cancelar
              </button>
            </div>
          </form>
        </Panel>
      )}

      {mensajes.length === 0 ? (
        <div className="rounded-lg border-[0.5px] border-black/10 bg-white p-8 text-center text-black/40">
          No tienes mensajes aún
        </div>
      ) : (
        <div className="space-y-3">
          {mensajes.map((m) => (
            <div key={m.id} className="rounded-lg border-[0.5px] border-black/10 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-base">{m.asunto}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="rounded-full bg-[#085041]/10 px-2 py-0.5 text-etiqueta font-medium text-[#085041]">
                      {CAT_LABEL[m.categoria] ?? m.categoria}
                    </span>
                    {m.numero_propiedad && <span className="text-etiqueta text-black/40">Unidad #{m.numero_propiedad}</span>}
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
                      <div className="text-etiqueta font-medium text-[#085041]">
                        Respuesta de {r.nombre_usuario}
                      </div>
                      <p className="mt-1 text-base text-black/70 whitespace-pre-wrap">{r.texto}</p>
                      <div className="mt-1 text-etiqueta text-black/30">{formatDate(r.fecha)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
