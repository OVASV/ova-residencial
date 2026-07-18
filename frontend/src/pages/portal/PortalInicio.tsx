import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconFileInvoice, IconMap2, IconMessageCircle, IconChartBar } from "@tabler/icons-react";
import { getMisUnidades, type MiUnidad } from "../../api/client";
import Panel from "../../components/ui/Panel";

export default function PortalInicio() {
  const [unidades, setUnidades] = useState<MiUnidad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMisUnidades().then(setUnidades).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Bienvenido</h1>
        <p className="text-base text-black/50">Portal del propietario — consulta tu información</p>
      </div>

      <Panel title="Mis propiedades">
        {unidades.length === 0 ? (
          <p className="py-4 text-center text-black/40">No tienes unidades asignadas</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {unidades.map((u) => (
              <Link
                key={u.id}
                to={`/mi-estado-cuenta?unidad=${encodeURIComponent(u.id)}`}
                className="rounded-lg border-[0.5px] border-black/10 bg-white p-4 shadow-sm hover:border-sidebar-accent/30 hover:shadow transition"
              >
                <div className="text-base font-semibold">Propiedad #{u.numero_propiedad ?? u.id}</div>
                <div className="mt-1 text-etiqueta text-black/50">
                  {[u.bloque, u.calle].filter(Boolean).join(" · ") || "—"}
                </div>
                {u.estado && (
                  <span className="mt-2 inline-block rounded-full bg-sidebar-accent/10 px-2 py-0.5 text-etiqueta font-medium text-sidebar-accent">
                    {u.estado}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          to="/mi-estado-cuenta"
          className="flex items-center gap-3 rounded-lg border-[0.5px] border-black/10 bg-white p-4 shadow-sm hover:border-sidebar-accent/30 transition"
        >
          <IconFileInvoice size={24} className="text-sidebar-accent" />
          <div>
            <div className="text-base font-semibold">Estado de cuenta</div>
            <div className="text-etiqueta text-black/40">Ver cargos y pagos</div>
          </div>
        </Link>
        <Link
          to="/mi-mapa"
          className="flex items-center gap-3 rounded-lg border-[0.5px] border-black/10 bg-white p-4 shadow-sm hover:border-sidebar-accent/30 transition"
        >
          <IconMap2 size={24} className="text-sidebar-accent" />
          <div>
            <div className="text-base font-semibold">Mi ubicación</div>
            <div className="text-etiqueta text-black/40">Ver en el mapa</div>
          </div>
        </Link>
        <Link
          to="/mis-mensajes"
          className="flex items-center gap-3 rounded-lg border-[0.5px] border-black/10 bg-white p-4 shadow-sm hover:border-sidebar-accent/30 transition"
        >
          <IconMessageCircle size={24} className="text-sidebar-accent" />
          <div>
            <div className="text-base font-semibold">Mensajes</div>
            <div className="text-etiqueta text-black/40">Enviar consulta o queja</div>
          </div>
        </Link>
        <Link
          to="/transparencia"
          className="flex items-center gap-3 rounded-lg border-[0.5px] border-black/10 bg-white p-4 shadow-sm hover:border-sidebar-accent/30 transition"
        >
          <IconChartBar size={24} className="text-sidebar-accent" />
          <div>
            <div className="text-base font-semibold">Finanzas</div>
            <div className="text-etiqueta text-black/40">Recaudación, gastos y saldo en caja</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
