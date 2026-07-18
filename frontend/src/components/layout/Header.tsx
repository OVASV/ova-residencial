import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconLogout, IconBuildingCommunity, IconMenu2 } from "@tabler/icons-react";
import { useAuth } from "../../stores/authStore";
import { initials } from "../../utils/formatters";
import { getComplejos, type ComplejoListItem } from "../../api/client";

const ROL_LABEL: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Administrador",
  lectura: "Solo lectura",
  directiva: "Junta Directiva",
  propietario: "Propietario",
};

export default function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b-[0.5px] border-black/10 bg-white px-3 md:px-5">
      <div className="flex items-center gap-2">
        {onMenuToggle && (
          <button onClick={onMenuToggle} className="rounded-md p-1.5 text-black/50 hover:bg-black/5 md:hidden">
            <IconMenu2 size={20} />
          </button>
        )}
        {user?.rol === "superadmin" && <ComplejoSwitcher />}
        {user?.rol !== "superadmin" && user?.nombre_complejo && (
          <div className="flex items-center gap-2">
            {user.logo_url && (
              <img src={user.logo_url} alt="" className="h-7 w-7 rounded object-contain" />
            )}
            <span className="text-base font-semibold text-[#085041]">{user.nombre_complejo}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-accent text-etiqueta font-semibold text-white">
            {initials(user?.nombre)}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-base text-ink">{user?.nombre}</div>
            <div className="text-etiqueta uppercase tracking-wide text-black/40">
              {ROL_LABEL[user?.rol ?? ""] ?? user?.rol}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          title="Cerrar sesión"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-base text-black/50 hover:bg-black/5 hover:text-estado-atrasado"
        >
          <IconLogout size={18} stroke={1.75} />
        </button>
      </div>
    </header>
  );
}

function ComplejoSwitcher() {
  const complejoActivo = useAuth((s) => s.complejoActivo);
  const setComplejoActivo = useAuth((s) => s.setComplejoActivo);
  const [items, setItems] = useState<ComplejoListItem[]>([]);

  useEffect(() => {
    getComplejos().then(setItems).catch(() => {});
  }, []);

  function onChange(id: string) {
    const c = items.find((x) => x.id === id);
    setComplejoActivo(c ? { id: c.id, nombre: c.nombre } : null);
    window.location.assign("/");
  }

  return (
    <label className="flex items-center gap-2">
      <IconBuildingCommunity size={16} className="text-sidebar-accent" />
      <select
        value={complejoActivo?.id ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border-[0.5px] border-black/20 bg-white py-1 pl-2 pr-7 text-base focus:outline-none focus:ring-2 focus:ring-sidebar-accent/40"
      >
        <option value="">— Selecciona complejo —</option>
        {items.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
    </label>
  );
}
