import { useEffect, useState } from "react";
import { IconPlus, IconTrash, IconKey, IconAlertCircle } from "@tabler/icons-react";
import { getAccesos, crearAcceso, eliminarAcceso, type AccesoPropietario } from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import { inputCls, labelCls } from "../../components/ui/form";
import { formatDate } from "../../utils/formatters";

export default function AccesosTab() {
  const [items, setItems] = useState<AccesoPropietario[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    getAccesos().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => load(), []);

  async function onDelete(userId: string, nombre: string) {
    if (!confirm(`¿Desactivar el acceso de "${nombre}"? Ya no podrá ingresar al portal.`)) return;
    await eliminarAcceso(userId);
    load();
  }

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  const conAcceso = items.filter((p) => p.usuario);
  const sinAcceso = items.filter((p) => !p.usuario && p.unidades.length > 0);

  return (
    <>
      <Panel
        title={`Accesos activos (${conAcceso.length})`}
        action={
          sinAcceso.length > 0 ? (
            <Button onClick={() => setCreating(true)}>
              <IconPlus size={16} /> Crear acceso
            </Button>
          ) : undefined
        }
      >
        {conAcceso.length === 0 ? (
          <EmptyState icon={<IconKey size={28} stroke={1.5} />} title="Sin accesos creados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-tabla">
              <thead>
                <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                  <th className="py-1.5 font-medium">Propietario</th>
                  <th className="py-1.5 font-medium">Email de acceso</th>
                  <th className="py-1.5 font-medium">Unidades</th>
                  <th className="py-1.5 font-medium">Creado</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {conAcceso.map((p) => (
                  <tr key={p.id} className="border-b-[0.5px] border-black/5">
                    <td className="py-2 font-medium">{p.nombre}</td>
                    <td className="py-2 text-black/70">{p.usuario!.email}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.unidades.map((u) => (
                          <span key={u.id} className="rounded bg-black/5 px-1.5 py-0.5 text-etiqueta font-mono">
                            #{u.numero_propiedad ?? u.id}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-etiqueta text-black/40">{formatDate(p.usuario!.created_at)}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => onDelete(p.usuario!.id, p.nombre)}
                        className="text-black/40 hover:text-estado-atrasado"
                        title="Desactivar acceso"
                      >
                        <IconTrash size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Info: propietarios sin unidades activas */}
      {items.some((p) => !p.usuario && p.unidades.length === 0) && (
        <div className="mt-4 flex items-start gap-2 rounded-md border-[0.5px] border-black/10 bg-black/[0.02] px-4 py-3 text-base text-black/50">
          <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            Hay propietarios sin unidades asignadas actualmente. Para crearles acceso, primero asígnales una unidad.
          </span>
        </div>
      )}

      {creating && (
        <CrearAccesoModal
          propietarios={sinAcceso}
          allItems={items}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
    </>
  );
}

function CrearAccesoModal({
  propietarios,
  allItems,
  onClose,
  onCreated,
}: {
  propietarios: AccesoPropietario[];
  allItems: AccesoPropietario[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [idProp, setIdProp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflicto, setConflicto] = useState<string | null>(null);

  const seleccionado = propietarios.find((p) => p.id === idProp);

  // Check for unit conflicts client-side
  function checkConflicto(propId: string) {
    const prop = propietarios.find((p) => p.id === propId);
    if (!prop) { setConflicto(null); return; }

    const unidadIds = new Set(prop.unidades.map((u) => u.id));
    const conflictos: string[] = [];

    for (const other of allItems) {
      if (other.id === propId || !other.usuario) continue;
      for (const u of other.unidades) {
        if (unidadIds.has(u.id)) {
          conflictos.push(`Unidad #${u.numero_propiedad ?? u.id} ya tiene acceso asignado a ${other.nombre}`);
        }
      }
    }

    setConflicto(conflictos.length > 0 ? conflictos.join(". ") : null);
  }

  function onSelectProp(id: string) {
    setIdProp(id);
    setError(null);
    checkConflicto(id);
    // Pre-fill email from propietario's email if available
    const prop = propietarios.find((p) => p.id === id);
    if (prop?.email_propietario) setEmail(prop.email_propietario);
    else setEmail("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!idProp || !email.trim() || !password.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await crearAcceso({ id_propietario: idProp, email: email.trim(), password: password.trim() });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear acceso");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Crear acceso de propietario" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}

        <label className="block">
          <span className={labelCls}>Propietario *</span>
          <select value={idProp} onChange={(e) => onSelectProp(e.target.value)} className={`${inputCls} mt-1`} required>
            <option value="">— Selecciona un propietario —</option>
            {propietarios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.unidades.map((u) => `#${u.numero_propiedad ?? u.id}`).join(", ")}
              </option>
            ))}
          </select>
        </label>

        {conflicto && (
          <div className="flex items-start gap-2 rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/5 px-3 py-2 text-etiqueta text-estado-atrasado">
            <IconAlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{conflicto}</span>
          </div>
        )}

        {seleccionado && !conflicto && (
          <>
            {seleccionado.unidades.length > 0 && (
              <div className="rounded-md bg-[#085041]/5 px-3 py-2 text-etiqueta text-[#085041]">
                Tendrá acceso a: {seleccionado.unidades.map((u) => `#${u.numero_propiedad ?? u.id}`).join(", ")}
              </div>
            )}

            <label className="block">
              <span className={labelCls}>Email de acceso *</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                required
                className={`${inputCls} mt-1`}
              />
            </label>

            <label className="block">
              <span className={labelCls}>Contraseña * (mínimo 6 caracteres)</span>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña inicial"
                required
                minLength={6}
                className={`${inputCls} mt-1 font-mono`}
              />
            </label>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !!conflicto || !idProp}>
            {saving ? "Creando…" : "Crear acceso"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
