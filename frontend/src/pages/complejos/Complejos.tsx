import { useEffect, useState } from "react";
import { useRef } from "react";
import { IconPlus, IconBuildingCommunity, IconCheck, IconUsers, IconBuildingEstate, IconPhoto, IconTrash } from "@tabler/icons-react";
import { getComplejos, createComplejo, uploadLogoComplejo, deleteLogoComplejo, type ComplejoListItem } from "../../api/client";
import { useAuth } from "../../stores/authStore";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import { inputCls, labelCls } from "../../components/ui/form";

// Gestión multiempresa: lista de complejos + crear + seleccionar el activo (superadmin).
export default function Complejos() {
  const complejoActivo = useAuth((s) => s.complejoActivo);
  const setComplejoActivo = useAuth((s) => s.setComplejoActivo);
  const [items, setItems] = useState<ComplejoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  function load() {
    setLoading(true);
    getComplejos().then(setItems).finally(() => setLoading(false));
  }
  useEffect(() => load(), []);

  function entrar(c: ComplejoListItem) {
    setComplejoActivo({ id: c.id, nombre: c.nombre });
    // Recarga al dashboard para que todo se recargue con el complejo activo.
    window.location.assign("/");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">Complejos</h1>
          <p className="text-base text-black/50">Administra varios proyectos. Elige el complejo activo para trabajar en él.</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <IconPlus size={16} /> Nuevo complejo
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-base text-black/40">Cargando…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<IconBuildingCommunity size={28} stroke={1.5} />} title="Sin complejos" hint="Crea el primero con «Nuevo complejo»" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <ComplejoCard key={c.id} c={c} activo={complejoActivo?.id === c.id} onEntrar={() => entrar(c)} onLogoChange={load} />
          ))}
        </div>
      )}

      {showNew && <NuevoComplejoModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function ComplejoCard({ c, activo, onEntrar, onLogoChange }: { c: ComplejoListItem; activo: boolean; onEntrar: () => void; onLogoChange: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadLogoComplejo(c.id, file);
      onLogoChange();
    } catch {} finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    setUploading(true);
    try {
      await deleteLogoComplejo(c.id);
      onLogoChange();
    } catch {} finally {
      setUploading(false);
    }
  }

  return (
    <div className={`rounded-lg border-[0.5px] bg-white p-4 shadow-sm ${activo ? "border-sidebar-accent ring-1 ring-sidebar-accent/30" : "border-black/15"}`}>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          {c.logo_url ? (
            <img src={c.logo_url} alt="" className="h-10 w-10 rounded-md object-contain" />
          ) : (
            <IconBuildingCommunity size={20} className="text-sidebar-accent" />
          )}
          <div>
            <div className="text-base font-semibold leading-tight">{c.nombre}</div>
            <div className="text-etiqueta uppercase tracking-wide text-black/40">{c.ciudad ?? "—"}</div>
          </div>
        </div>
        {activo && (
          <span className="flex items-center gap-1 rounded-full bg-sidebar-accent/12 px-2 py-0.5 text-etiqueta font-medium uppercase text-sidebar-accent">
            <IconCheck size={12} /> Activo
          </span>
        )}
      </div>

      {/* Logo actions */}
      <div className="mb-3 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded-md border-[0.5px] border-black/15 px-2 py-1 text-etiqueta text-black/50 hover:bg-black/[0.03] transition"
        >
          <IconPhoto size={13} /> {c.logo_url ? "Cambiar logo" : "Subir logo"}
        </button>
        {c.logo_url && (
          <button
            onClick={removeLogo}
            disabled={uploading}
            className="flex items-center gap-1 rounded-md border-[0.5px] border-black/15 px-2 py-1 text-etiqueta text-estado-atrasado/70 hover:bg-estado-atrasado/5 transition"
          >
            <IconTrash size={13} /> Quitar
          </button>
        )}
      </div>

      <div className="mb-3 flex gap-4 text-etiqueta uppercase tracking-wide text-black/45">
        <span className="flex items-center gap-1"><IconBuildingEstate size={14} /> {c._count.unidades} unid.</span>
        <span className="flex items-center gap-1"><IconUsers size={14} /> {c._count.propietarios} prop.</span>
      </div>
      <Button variant={activo ? "secondary" : "primary"} className="w-full" onClick={onEntrar} disabled={activo}>
        {activo ? "Trabajando aquí" : "Entrar a este complejo"}
      </Button>
    </div>
  );
}

function NuevoComplejoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createComplejo({ nombre: nombre.trim(), ciudad: ciudad.trim() || undefined });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nuevo complejo" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <label className="block">
          <span className={labelCls}>Nombre del residencial *</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className={`${inputCls} mt-1`} />
        </label>
        <label className="block">
          <span className={labelCls}>Ciudad / zona</span>
          <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <p className="text-etiqueta uppercase tracking-wide text-black/40">
          Luego entra al complejo y configura sus bloques, calles, estados y tarifas.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creando…" : "Crear complejo"}</Button>
        </div>
      </form>
    </Modal>
  );
}
