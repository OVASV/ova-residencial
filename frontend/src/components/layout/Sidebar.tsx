import { NavLink } from "react-router-dom";
import {
  IconLayoutDashboard,
  IconUsers,
  IconCash,
  IconReceipt2,
  IconBell,
  IconActivity,
  IconSettings,
  IconBuildingCommunity,
  IconTransfer,
  IconMap2,
  IconX,
  IconFileInvoice,
  IconMessageCircle,
  IconMailbox,
  IconReceipt,
  IconChartBar,
  IconPhoneCall,
  type IconProps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { useAuth } from "../../stores/authStore";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<IconProps>;
  end?: boolean;
  roles?: string[];
}

const NAV_ADMIN: NavItem[] = [
  { to: "/", label: "Dashboard", icon: IconLayoutDashboard, end: true },
  { to: "/residentes", label: "Unidades", icon: IconUsers, end: true, roles: ["superadmin", "admin", "lectura"] },
  { to: "/residentes/mapa", label: "Mapa", icon: IconMap2, roles: ["superadmin", "admin", "lectura", "directiva"] },
  { to: "/pagos", label: "Pagos", icon: IconCash, end: true, roles: ["superadmin", "admin", "lectura"] },
  { to: "/pagos/recibos", label: "Recibos", icon: IconReceipt, roles: ["superadmin", "admin", "lectura"] },
  { to: "/pagos/traslados", label: "Especiales", icon: IconTransfer, roles: ["superadmin", "admin", "lectura"] },
  { to: "/cobranza", label: "Cobranza", icon: IconPhoneCall, roles: ["superadmin", "admin", "lectura", "directiva"] },
  { to: "/gastos", label: "Gastos", icon: IconReceipt2, roles: ["superadmin", "admin", "lectura", "directiva"] },
  { to: "/transparencia", label: "Finanzas", icon: IconChartBar, roles: ["superadmin", "admin", "lectura"] },
  { to: "/avisos", label: "Avisos", icon: IconBell, roles: ["superadmin", "admin", "lectura", "directiva"] },
  { to: "/notificaciones", label: "Notificaciones", icon: IconMailbox, roles: ["superadmin", "admin", "directiva"] },
];

const NAV_PROPIETARIO: NavItem[] = [
  { to: "/", label: "Inicio", icon: IconLayoutDashboard, end: true },
  { to: "/mi-estado-cuenta", label: "Estado de cuenta", icon: IconFileInvoice },
  { to: "/mi-mapa", label: "Mi ubicación", icon: IconMap2 },
  { to: "/mis-mensajes", label: "Mensajes", icon: IconMessageCircle },
  { to: "/transparencia", label: "Finanzas", icon: IconChartBar },
];

export default function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const user = useAuth((s) => s.user);
  const rol: string = user?.rol ?? "lectura";

  const navSource = rol === "propietario" ? NAV_PROPIETARIO : NAV_ADMIN;
  const items = navSource.filter((n) => !n.roles || n.roles.includes(rol));

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-md px-3 py-2 text-base transition-colors ${
      isActive
        ? "bg-sidebar-accent text-sidebar-accentText"
        : "text-white/75 hover:bg-white/5 hover:text-white"
    }`;

  const content = (
    <aside className="flex h-full w-[168px] shrink-0 flex-col bg-sidebar-bg text-white">
      {/* Logo + nombre usuario */}
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex flex-col items-center gap-0.5 flex-1">
          <img src="/logo-ovablack.png" alt="OVA" className="h-10 object-contain" />
          <div className="text-[10px] font-bold text-center text-white/50 leading-tight tracking-wide">
            Desarrollando Soluciones_
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-1 rounded-md p-1 text-white/60 hover:bg-white/10 md:hidden">
            <IconX size={18} />
          </button>
        )}
      </div>

      {/* Navegación principal */}
      <nav className="flex flex-col gap-0.5 px-2">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkCls} onClick={onClose}>
            <Icon size={18} stroke={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom items */}
      {rol !== "propietario" && <div className="mt-auto px-2 pb-3">
        {user?.rol === "superadmin" && (
          <NavLink to="/complejos" className={linkCls} onClick={onClose}>
            <IconBuildingCommunity size={18} stroke={1.75} />
            Complejos
          </NavLink>
        )}
        {(user?.rol === "admin" || user?.rol === "superadmin") && (
          <NavLink to="/configuracion" className={linkCls} onClick={onClose}>
            <IconSettings size={18} stroke={1.75} />
            Configuración
          </NavLink>
        )}
        {rol === "superadmin" && (
          <NavLink
            to="/sistema"
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-3 py-2 text-base transition-colors ${
                isActive ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
              }`
            }
            onClick={onClose}
          >
            <IconActivity size={18} stroke={1.75} />
            Sistema
          </NavLink>
        )}
      </div>}
    </aside>
  );

  // Mobile: overlay drawer
  if (onClose !== undefined) {
    return (
      <>
        {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />}
        <div
          className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 md:relative md:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {content}
        </div>
      </>
    );
  }

  return content;
}
