import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconFileInvoice, IconMap2, IconMessageCircle, IconChartBar, IconCalendarClock, IconAlertTriangle, IconArrowRight, IconCoin, IconCircleCheck } from "@tabler/icons-react";
import { getMisUnidades, getMisPromesas, type MiUnidad, type PromesaActiva } from "../../api/client";
import Panel from "../../components/ui/Panel";
import { formatDate, formatCurrency } from "../../utils/formatters";

export default function PortalInicio() {
  const [unidades, setUnidades] = useState<MiUnidad[]>([]);
  const [promesas, setPromesas] = useState<PromesaActiva[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getMisUnidades().then(setUnidades).catch(() => {}),
      getMisPromesas().then(setPromesas).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  const conPromesa = new Set(promesas.map((p) => p.id_unidad));
  // Unidades que deben pero NO tienen promesa activa (esas ya salen en su banner).
  const pendientes = unidades.filter((u) => (u.saldo ?? 0) > 0 && !conPromesa.has(u.id));
  const totalPendiente = Math.round(pendientes.reduce((s, u) => s + (u.saldo ?? 0), 0) * 100) / 100;
  const alDia = unidades.length > 0 && unidades.every((u) => (u.saldo ?? 0) <= 0);

  return (
    <div className="space-y-5">
      {promesas.map((p) => (
        <PromesaBanner key={p.id_unidad} promesa={p} />
      ))}
      {totalPendiente > 0 && <SaldoPendienteBanner total={totalPendiente} unidades={pendientes} />}
      {alDia && promesas.length === 0 && <AlDiaBanner />}

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
                <div className="flex items-start justify-between gap-2">
                  <div className="text-base font-semibold">Propiedad #{u.numero_propiedad ?? u.id}</div>
                  {u.saldo !== undefined && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-etiqueta font-semibold ${
                      u.saldo > 0 ? "bg-estado-atrasado/12 text-estado-atrasado" : "bg-estado-pagado/12 text-estado-pagado"
                    }`}>
                      {u.saldo > 0 ? `Debe ${formatCurrency(u.saldo)}` : "Al día"}
                    </span>
                  )}
                </div>
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

function SaldoPendienteBanner({ total, unidades }: { total: number; unidades: MiUnidad[] }) {
  const to = unidades.length === 1 ? `/mi-estado-cuenta?unidad=${encodeURIComponent(unidades[0].id)}` : "/mi-estado-cuenta";
  return (
    <div className="flex items-start gap-3.5 rounded-xl border-[0.5px] border-estado-atrasado/30 bg-gradient-to-r from-estado-atrasado/[0.09] to-transparent p-4 shadow-sm sm:p-5">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-estado-atrasado/15 text-estado-atrasado">
        <IconCoin size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold text-estado-atrasado">Tienes un saldo pendiente</div>
        <p className="mt-1 text-base leading-snug text-black/70">
          Debes <b>{formatCurrency(total)}</b>
          {unidades.length === 1
            ? <> por tu propiedad <b>#{unidades[0].numero_propiedad ?? ""}</b>.</>
            : <> en {unidades.length} de tus propiedades.</>}{" "}
          Ponte al día para evitar recargos.
        </p>
        <Link to={to} className="mt-2.5 inline-flex items-center gap-1 text-etiqueta font-semibold text-estado-atrasado hover:underline">
          Ver mi estado de cuenta <IconArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function AlDiaBanner() {
  return (
    <div className="flex items-center gap-3 rounded-xl border-[0.5px] border-estado-pagado/30 bg-gradient-to-r from-estado-pagado/[0.08] to-transparent p-4 shadow-sm">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-estado-pagado/15 text-estado-pagado">
        <IconCircleCheck size={20} />
      </div>
      <div>
        <div className="text-base font-semibold text-estado-pagado">Estás al día</div>
        <p className="text-etiqueta text-black/50">No tienes saldos pendientes. ¡Gracias!</p>
      </div>
    </div>
  );
}

function PromesaBanner({ promesa }: { promesa: PromesaActiva }) {
  const vencida = promesa.vencida;
  const to = `/mi-estado-cuenta?unidad=${encodeURIComponent(promesa.id_unidad)}`;
  return (
    <div
      className={`flex items-start gap-3.5 rounded-xl border-[0.5px] p-4 shadow-sm sm:p-5 ${
        vencida
          ? "border-estado-atrasado/30 bg-gradient-to-r from-estado-atrasado/[0.09] to-transparent"
          : "border-estado-pendiente/40 bg-gradient-to-r from-estado-pendiente/[0.10] to-transparent"
      }`}
    >
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
          vencida ? "bg-estado-atrasado/15 text-estado-atrasado" : "bg-estado-pendiente/20 text-estado-pendiente"
        }`}
      >
        {vencida ? <IconAlertTriangle size={22} /> : <IconCalendarClock size={22} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-base font-bold ${vencida ? "text-estado-atrasado" : "text-estado-pendiente"}`}>
          {vencida ? "Tu promesa de pago venció" : "Tienes una promesa de pago pendiente"}
        </div>
        <p className="mt-1 text-base leading-snug text-black/70">
          {vencida ? (
            <>
              Te comprometiste a pagar el <b>{formatDate(promesa.promesa_fecha)}</b> y esa fecha ya pasó.
              Por favor regulariza el pago de tu propiedad <b>#{promesa.numero_propiedad ?? ""}</b>.
            </>
          ) : (
            <>
              Te comprometiste a pagar el <b>{formatDate(promesa.promesa_fecha)}</b> por tu propiedad{" "}
              <b>#{promesa.numero_propiedad ?? ""}</b>. ¡Gracias por tu compromiso!
            </>
          )}
        </p>
        <Link
          to={to}
          className={`mt-2.5 inline-flex items-center gap-1 text-etiqueta font-semibold hover:underline ${
            vencida ? "text-estado-atrasado" : "text-estado-pendiente"
          }`}
        >
          Ver mi estado de cuenta <IconArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
