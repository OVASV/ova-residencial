import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IconArrowLeft, IconSearch, IconBrandWhatsapp, IconPhone, IconMail, IconHome2, IconDots } from "@tabler/icons-react";
import { getBitacora, type BitacoraItem } from "../../api/client";
import Panel from "../../components/ui/Panel";
import MonoAmount from "../../components/ui/MonoAmount";
import { inputCls } from "../../components/ui/form";

const RESULTADO_LABEL: Record<string, string> = {
  contactado: "Contactado",
  promesa_pago: "Promesa de pago",
  sin_respuesta: "Sin respuesta",
  numero_erroneo: "Número erróneo",
  mensaje_enviado: "WhatsApp enviado",
  otro: "Otro",
};
const RESULTADO_TONE: Record<string, string> = {
  contactado: "bg-sidebar-accent/10 text-sidebar-accent",
  promesa_pago: "bg-estado-pendiente/15 text-estado-pendiente",
  sin_respuesta: "bg-estado-atrasado/12 text-estado-atrasado",
  numero_erroneo: "bg-estado-atrasado/12 text-estado-atrasado",
  mensaje_enviado: "bg-[#25D366]/12 text-[#128C4B]",
  otro: "bg-black/5 text-black/50",
};
const CANAL_ICON: Record<string, React.ReactNode> = {
  llamada: <IconPhone size={14} />,
  whatsapp: <IconBrandWhatsapp size={14} />,
  email: <IconMail size={14} />,
  visita: <IconHome2 size={14} />,
  otro: <IconDots size={14} />,
};

// Agrupa por día con etiqueta relativa (Hoy / Ayer / fecha larga).
function etiquetaDia(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const h0 = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const diff = Math.round((h0.getTime() - dd.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return dd.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function Bitacora() {
  const [data, setData] = useState<BitacoraItem[] | null>(null);
  const [q, setQ] = useState("");
  const [canal, setCanal] = useState("");
  const [usuario, setUsuario] = useState("");

  useEffect(() => {
    getBitacora(500).then(setData).catch(() => setData([]));
  }, []);

  const usuarios = useMemo(() => [...new Set((data ?? []).map((g) => g.registrado_por).filter(Boolean))] as string[], [data]);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((g) => {
      if (canal && g.canal !== canal) return false;
      if (usuario && g.registrado_por !== usuario) return false;
      if (s && !(g.numero_propiedad.toLowerCase().includes(s) || (g.propietario ?? "").toLowerCase().includes(s) || (g.nota ?? "").toLowerCase().includes(s))) return false;
      return true;
    });
  }, [data, q, canal, usuario]);

  // Agrupar por propiedad/propietario; dentro, secuencia cronológica (más antigua → reciente).
  const grupos = useMemo(() => {
    const map = new Map<string, BitacoraItem[]>();
    for (const g of filtrados) {
      if (!map.has(g.id_unidad)) map.set(g.id_unidad, []);
      map.get(g.id_unidad)!.push(g);
    }
    const arr = [...map.entries()].map(([id, items]) => {
      const ordenados = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return {
        id,
        numero_propiedad: items[0].numero_propiedad,
        propietario: items[0].propietario,
        items: ordenados,
        ultima: ordenados[ordenados.length - 1].created_at,
      };
    });
    // Grupos ordenados por actividad más reciente primero.
    arr.sort((a, b) => b.ultima.localeCompare(a.ultima));
    return arr;
  }, [filtrados]);

  if (!data) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Bitácora de gestiones</h1>
          <p className="text-base text-black/50">Todas las gestiones de cobranza, quién y cuándo</p>
        </div>
        <Link to="/cobranza" className="inline-flex items-center gap-1 text-etiqueta font-medium text-sidebar-accent hover:underline">
          <IconArrowLeft size={14} /> Volver a cobranza
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Canal</label>
          <select value={canal} onChange={(e) => setCanal(e.target.value)} className={`${inputCls} w-36`}>
            <option value="">Todos</option>
            <option value="llamada">Llamada</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="visita">Visita</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-etiqueta text-black/40">Gestor</label>
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} className={`${inputCls} w-44`}>
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <label className="mb-0.5 block text-etiqueta text-black/40">Buscar</label>
          <IconSearch size={14} className="absolute left-2.5 bottom-2.5 text-black/30" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Propiedad, propietario o nota…" className={`${inputCls} pl-8`} />
        </div>
      </div>

      {grupos.length === 0 ? (
        <Panel><p className="py-6 text-center text-black/40">Sin gestiones registradas</p></Panel>
      ) : (
        grupos.map((grupo) => (
          <div key={grupo.id}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-base font-semibold text-ink">
                <span className="font-mono">{grupo.numero_propiedad}</span>
                {grupo.propietario && <span className="font-normal text-black/60"> · {grupo.propietario}</span>}
              </h2>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-etiqueta text-black/45">
                {grupo.items.length} {grupo.items.length === 1 ? "gestión" : "gestiones"}
              </span>
            </div>
            <Panel>
              <ol className="relative space-y-3 border-l-[1.5px] border-black/10 pl-4">
                {grupo.items.map((g) => (
                  <li key={g.id} className="relative">
                    <span className={`absolute -left-[1.35rem] top-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white ${RESULTADO_TONE[g.resultado] ?? "bg-black/5 text-black/50"}`}>
                      {CANAL_ICON[g.canal] ?? <IconDots size={14} />}
                    </span>
                    <div className="flex flex-wrap items-center gap-x-2 text-base">
                      <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium ${RESULTADO_TONE[g.resultado] ?? "bg-black/5 text-black/50"}`}>
                        {RESULTADO_LABEL[g.resultado] ?? g.resultado}
                      </span>
                      <span className="text-etiqueta text-black/45">{etiquetaDia(g.created_at)} · {new Date(g.created_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {g.promesa_fecha && (
                      <div className="text-etiqueta text-sidebar-accent">Prometió pagar el {new Date(g.promesa_fecha).toLocaleDateString("es", { day: "numeric", month: "long", timeZone: "UTC" })}</div>
                    )}
                    {g.nota && <div className="text-base text-black/65">{g.nota}</div>}
                    <div className="text-etiqueta text-black/40">
                      {g.registrado_por ?? "—"}
                      {g.saldo_al_momento != null && <> · saldo <MonoAmount value={Number(g.saldo_al_momento)} className="inline" /></>}
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
        ))
      )}
    </div>
  );
}
