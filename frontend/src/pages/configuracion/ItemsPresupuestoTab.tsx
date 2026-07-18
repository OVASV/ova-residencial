import { useEffect, useState } from "react";
import { IconPlus, IconPencil, IconCircleOff, IconRestore } from "@tabler/icons-react";
import {
  getItemsPresupuesto,
  createItemPresupuesto,
  updateItemPresupuesto,
  deleteItemPresupuesto,
  type ItemPresupuesto,
  type CategoriaGasto,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import { inputCls, labelCls } from "../../components/ui/form";

const CATS: { id: CategoriaGasto; label: string; color: string }[] = [
  { id: "seguridad", label: "Seguridad", color: "#E24B4A" },
  { id: "limpieza", label: "Limpieza", color: "#EF9F27" },
  { id: "mantenimiento", label: "Mantenimiento", color: "#4A90D9" },
  { id: "servicios", label: "Servicios", color: "#7B5EA7" },
  { id: "administrativo", label: "Administrativo", color: "#1D9E75" },
  { id: "planilla", label: "Planilla", color: "#0891B2" },
  { id: "extraordinario", label: "Extraordinario", color: "#888888" },
  { id: "ajuste", label: "Ajuste / Saldo inicial", color: "#64748B" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

export default function ItemsPresupuestoTab() {
  const [items, setItems] = useState<ItemPresupuesto[]>([]);
  const [categoria, setCategoria] = useState<CategoriaGasto>("seguridad");
  const [nombre, setNombre] = useState("");
  const [editando, setEditando] = useState<ItemPresupuesto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getItemsPresupuesto().then(setItems).finally(() => setLoading(false));
  }
  useEffect(() => load(), []);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createItemPresupuesto(categoria, nombre.trim());
      setNombre("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    }
  }

  return (
    <Panel
      action={
        <form onSubmit={agregar} className="flex items-center gap-2">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)} className={`${inputCls} w-36 py-1.5`}>
            {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nuevo item…" className={`${inputCls} w-48 py-1.5`} />
          <Button type="submit" disabled={!nombre.trim()}>
            <IconPlus size={16} /> Agregar
          </Button>
        </form>
      }
    >
      {error && <div className="mb-3 text-base text-estado-atrasado">{error}</div>}
      {loading ? (
        <div className="py-8 text-center text-base text-black/40">Cargando…</div>
      ) : items.length === 0 ? (
        <EmptyState title="Sin items de presupuesto" hint="Agrega el primero arriba (p. ej. «Guardia nocturno»)" />
      ) : (
        <table className="w-full text-tabla">
          <thead>
            <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
              <th className="py-1.5 font-medium">Categoría</th>
              <th className="py-1.5 font-medium">Item</th>
              <th className="py-1.5 font-medium">Estado</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b-[0.5px] border-black/5">
                <td className="py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT[it.categoria].color }} />
                    {CAT[it.categoria].label}
                  </span>
                </td>
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
                      <button onClick={async () => { await deleteItemPresupuesto(it.id); load(); }} className="text-black/40 hover:text-estado-atrasado" aria-label="Desactivar"><IconCircleOff size={16} /></button>
                    ) : (
                      <button onClick={async () => { await updateItemPresupuesto(it.id, { activo: true }); load(); }} className="text-black/40 hover:text-estado-pagado" aria-label="Reactivar"><IconRestore size={16} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editando && (
        <EditarItemModal
          item={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); load(); }}
        />
      )}
    </Panel>
  );
}

function EditarItemModal({ item, onClose, onSaved }: { item: ItemPresupuesto; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(item.nombre);
  const [categoria, setCategoria] = useState<CategoriaGasto>(item.categoria);
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="Editar item" onClose={onClose}>
      <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await updateItemPresupuesto(item.id, { nombre: nombre.trim(), categoria }); onSaved(); } finally { setSaving(false); } }} className="space-y-3">
        <label className="block">
          <span className={labelCls}>Categoría</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)} className={`${inputCls} mt-1`}>
            {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Item *</span>
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
