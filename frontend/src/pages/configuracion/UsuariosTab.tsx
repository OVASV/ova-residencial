import { useEffect, useState } from "react";
import { IconPlus, IconPencil, IconTrash, IconUsersGroup } from "@tabler/icons-react";
import {
  getUsuariosStaff,
  crearUsuarioStaff,
  actualizarUsuarioStaff,
  desactivarUsuarioStaff,
  type UsuarioStaff,
  type RolStaff,
} from "../../api/client";
import { useAuth } from "../../stores/authStore";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import { inputCls, labelCls } from "../../components/ui/form";
import { formatDate } from "../../utils/formatters";

const ROLES: { value: RolStaff; label: string; desc: string }[] = [
  { value: "admin", label: "Administrador", desc: "Gestiona el complejo activo" },
  { value: "directiva", label: "Directiva", desc: "Consulta y recibe avisos (p. ej. cierres)" },
  { value: "superadmin", label: "Superadministrador", desc: "Acceso global a todos los complejos" },
];
const rolLabel = (r: RolStaff) => ROLES.find((x) => x.value === r)?.label ?? r;
const ROL_BADGE: Record<RolStaff, string> = {
  superadmin: "bg-sidebar-accent/12 text-sidebar-accent",
  admin: "bg-[#085041]/10 text-[#085041]",
  directiva: "bg-black/5 text-black/60",
};

export default function UsuariosTab() {
  const miId = useAuth((s) => s.user?.id);
  const complejoActivo = useAuth((s) => s.complejoActivo);
  const [items, setItems] = useState<UsuarioStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UsuarioStaff | "new" | null>(null);

  function load() {
    setLoading(true);
    getUsuariosStaff().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }
  useEffect(() => load(), []);

  async function onDesactivar(u: UsuarioStaff) {
    if (!confirm(`¿Desactivar a "${u.nombre}"? Ya no podrá iniciar sesión.`)) return;
    try {
      await desactivarUsuarioStaff(u.id);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  return (
    <>
      <Panel
        title={`Usuarios (${items.length})`}
        action={
          <Button onClick={() => setEditing("new")}>
            <IconPlus size={16} /> Nuevo usuario
          </Button>
        }
      >
        {!complejoActivo && (
          <div className="mb-3 rounded-md border-[0.5px] border-black/10 bg-black/[0.02] px-3 py-2 text-etiqueta text-black/50">
            Sin complejo activo seleccionado: solo verás/crearás superadministradores. Para crear administradores o directiva, selecciona primero un complejo.
          </div>
        )}
        {items.length === 0 ? (
          <EmptyState icon={<IconUsersGroup size={28} stroke={1.5} />} title="Sin usuarios de staff" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-tabla">
              <thead>
                <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                  <th className="py-1.5 font-medium">Nombre</th>
                  <th className="py-1.5 font-medium">Email</th>
                  <th className="py-1.5 font-medium">Rol</th>
                  <th className="py-1.5 font-medium">Complejo</th>
                  <th className="py-1.5 font-medium">Estado</th>
                  <th className="py-1.5 font-medium">Creado</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className="border-b-[0.5px] border-black/5">
                    <td className="py-2 font-medium">
                      {u.nombre}
                      {u.id === miId && <span className="ml-1.5 text-etiqueta text-black/40">(tú)</span>}
                    </td>
                    <td className="py-2 text-black/70">{u.email}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${ROL_BADGE[u.rol]}`}>
                        {rolLabel(u.rol)}
                      </span>
                    </td>
                    <td className="py-2 text-black/60">{u.rol === "superadmin" ? "— Global —" : u.nombre_complejo ?? "—"}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${u.activo ? "bg-estado-pagado/12 text-estado-pagado" : "bg-black/5 text-black/45"}`}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="py-2 text-etiqueta text-black/40">{formatDate(u.created_at)}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditing(u)} className="text-black/40 hover:text-ink" aria-label="Editar">
                          <IconPencil size={16} />
                        </button>
                        {u.activo && u.id !== miId && (
                          <button onClick={() => onDesactivar(u)} className="text-black/40 hover:text-estado-atrasado" aria-label="Desactivar">
                            <IconTrash size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && (
        <UsuarioModal
          usuario={editing === "new" ? null : editing}
          hayComplejo={!!complejoActivo}
          complejoNombre={complejoActivo?.nombre ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function UsuarioModal({
  usuario,
  hayComplejo,
  complejoNombre,
  onClose,
  onSaved,
}: {
  usuario: UsuarioStaff | null;
  hayComplejo: boolean;
  complejoNombre: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esNuevo = !usuario;
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [rol, setRol] = useState<RolStaff>(usuario?.rol ?? "directiva");
  const [password, setPassword] = useState("");
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const necesitaComplejo = rol !== "superadmin";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (esNuevo && necesitaComplejo && !hayComplejo) {
      setError("Selecciona un complejo activo para crear administrador o directiva.");
      return;
    }
    setSaving(true);
    try {
      if (esNuevo) {
        await crearUsuarioStaff({ nombre: nombre.trim(), email: email.trim(), password, rol });
      } else {
        await actualizarUsuarioStaff(usuario!.id, {
          nombre: nombre.trim(),
          email: email.trim(),
          rol,
          activo,
          ...(password ? { password } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={esNuevo ? "Nuevo usuario" : "Editar usuario"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}

        <label className="block">
          <span className={labelCls}>Nombre *</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className={`${inputCls} mt-1`} />
        </label>

        <label className="block">
          <span className={labelCls}>Email *</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={`${inputCls} mt-1`} />
        </label>

        <label className="block">
          <span className={labelCls}>Rol *</span>
          <select value={rol} onChange={(e) => setRol(e.target.value as RolStaff)} className={`${inputCls} mt-1`}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <span className="mt-1 block text-etiqueta text-black/45">{ROLES.find((r) => r.value === rol)?.desc}</span>
        </label>

        {necesitaComplejo && (
          <div className="rounded-md bg-[#085041]/5 px-3 py-2 text-etiqueta text-[#085041]">
            {hayComplejo
              ? <>Se asignará al complejo activo: <b>{complejoNombre}</b></>
              : "⚠ Sin complejo activo. Selecciona uno para poder asignar este rol."}
          </div>
        )}

        <label className="block">
          <span className={labelCls}>
            {esNuevo ? "Contraseña * (mínimo 6 caracteres)" : "Nueva contraseña (dejar vacío para no cambiar)"}
          </span>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={esNuevo ? "Contraseña inicial" : "••••••"}
            required={esNuevo}
            minLength={6}
            className={`${inputCls} mt-1 font-mono`}
          />
        </label>

        {!esNuevo && (
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
