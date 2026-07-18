import { useEffect, useState } from "react";
import { IconPlus, IconPencil, IconCircleOff, IconRestore } from "@tabler/icons-react";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import { inputCls, labelCls } from "../../components/ui/form";
import type { Catalogo } from "../../api/client";

// Mantenimiento genérico de un catálogo simple (bloques, calles).
export default function CatalogoTab({
  singular,
  getItems,
  createItem,
  updateItem,
  deleteItem,
}: {
  singular: string;
  getItems: () => Promise<Catalogo[]>;
  createItem: (nombre: string) => Promise<Catalogo>;
  updateItem: (id: string, patch: Partial<Catalogo>) => Promise<Catalogo>;
  deleteItem: (id: string) => Promise<void>;
}) {
  const [items, setItems] = useState<Catalogo[]>([]);
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<Catalogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getItems().then(setItems).finally(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createItem(nuevo.trim());
      setNuevo("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    }
  }

  return (
    <Panel
      action={
        <form onSubmit={agregar} className="flex items-center gap-2">
          <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder={`Nuevo ${singular}…`} className={`${inputCls} w-56 py-1.5`} />
          <Button type="submit" disabled={!nuevo.trim()}>
            <IconPlus size={16} /> Agregar
          </Button>
        </form>
      }
    >
      {error && <div className="mb-3 text-base text-estado-atrasado">{error}</div>}
      {loading ? (
        <div className="py-8 text-center text-base text-black/40">Cargando…</div>
      ) : items.length === 0 ? (
        <EmptyState title={`Sin ${singular}s registrados`} hint={`Agrega el primero arriba`} />
      ) : (
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">Nombre</th>
              <th className="py-1.5 font-medium">Estado</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b-[0.5px] border-black/5">
                <td className="py-2 font-medium">{it.nombre}</td>
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${it.activo ? "bg-estado-pagado/12 text-estado-pagado" : "bg-black/5 text-black/45"}`}>
                    {it.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditando(it)} className="text-black/40 hover:text-sidebar-accent" aria-label="Editar"><IconPencil size={16} /></button>
                    {it.activo ? (
                      <button onClick={async () => { await deleteItem(it.id); load(); }} className="text-black/40 hover:text-estado-atrasado" aria-label="Desactivar"><IconCircleOff size={16} /></button>
                    ) : (
                      <button onClick={async () => { await updateItem(it.id, { activo: true }); load(); }} className="text-black/40 hover:text-estado-pagado" aria-label="Reactivar"><IconRestore size={16} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editando && (
        <EditarModal
          singular={singular}
          item={editando}
          onClose={() => setEditando(null)}
          onSave={async (nombre) => { await updateItem(editando.id, { nombre }); setEditando(null); load(); }}
        />
      )}
    </Panel>
  );
}

function EditarModal({
  singular,
  item,
  onClose,
  onSave,
}: {
  singular: string;
  item: Catalogo;
  onClose: () => void;
  onSave: (nombre: string) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(item.nombre);
  const [saving, setSaving] = useState(false);
  return (
    <Modal title={`Editar ${singular}`} onClose={onClose}>
      <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await onSave(nombre.trim()); } finally { setSaving(false); } }} className="space-y-3">
        <label className="block">
          <span className={labelCls}>Nombre *</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className={`${inputCls} mt-1`} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving || !nombre.trim()}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
