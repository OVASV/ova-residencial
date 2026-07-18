import { useEffect, useState, useRef } from "react";
import { IconPhoto, IconTrash } from "@tabler/icons-react";
import {
  getComplejo,
  updateComplejo,
  uploadLogoProyecto,
  deleteLogoProyecto,
  getGeoPaises,
  getGeoDepartamentos,
  getGeoMunicipios,
  type GeoItem,
} from "../../api/client";
import { useAuth } from "../../stores/authStore";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import { inputCls, labelCls } from "../../components/ui/form";

export default function ProyectoTab() {
  const canEdit = useAuth((s) => s.user?.rol) === "superadmin";
  const [complejoId, setComplejoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [direccion, setDireccion] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [idPais, setIdPais] = useState<number | "">("");
  const [idDepto, setIdDepto] = useState<number | "">("");
  const [idMuni, setIdMuni] = useState<number | "">("");

  const [paises, setPaises] = useState<GeoItem[]>([]);
  const [deptos, setDeptos] = useState<GeoItem[]>([]);
  const [munis, setMunis] = useState<GeoItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getComplejo(), getGeoPaises()])
      .then(async ([c, ps]) => {
        setPaises(ps);
        setComplejoId(c.id);
        setNombre(c.nombre);
        setCiudad(c.ciudad ?? "");
        setDireccion(c.direccion ?? "");
        setLogoUrl(c.logo_url);
        setIdPais(c.id_pais_geo ?? "");
        setIdDepto(c.id_departamento ?? "");
        setIdMuni(c.id_municipio ?? "");
        if (c.id_pais_geo) setDeptos(await getGeoDepartamentos(c.id_pais_geo));
        if (c.id_departamento) setMunis(await getGeoMunicipios(c.id_departamento));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function cambiarPais(v: number | "") {
    setIdPais(v);
    setIdDepto("");
    setIdMuni("");
    setDeptos(v ? await getGeoDepartamentos(Number(v)) : []);
    setMunis([]);
  }

  async function cambiarDepto(v: number | "") {
    setIdDepto(v);
    setIdMuni("");
    setMunis(v ? await getGeoMunicipios(Number(v)) : []);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setSaving(true);
    try {
      await updateComplejo({
        nombre: nombre.trim(),
        ciudad: ciudad.trim() || null,
        direccion: direccion.trim() || null,
        id_pais_geo: idPais === "" ? null : Number(idPais),
        id_departamento: idDepto === "" ? null : Number(idDepto),
        id_municipio: idMuni === "" ? null : Number(idMuni),
      });
      setMsg("Datos del proyecto guardados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  return (
    <Panel title="Datos del proyecto">
      <div className="max-w-2xl space-y-4">
        {/* Logo */}
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded-lg border border-black/10 object-contain" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-black/20 bg-black/[0.02]">
              <IconPhoto size={24} className="text-black/25" />
            </div>
          )}
          <div className="space-y-1">
            <div className="text-base font-medium text-black/70">Logo del proyecto</div>
            {canEdit && <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !complejoId) return;
                setUploadingLogo(true);
                try {
                  const res = await uploadLogoProyecto(file);
                  setLogoUrl(res.logo_url);
                  setMsg("Logo actualizado.");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Error al subir logo");
                } finally {
                  setUploadingLogo(false);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }} className="hidden" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingLogo}
                className="flex items-center gap-1 rounded-md border-[0.5px] border-black/15 px-2.5 py-1 text-etiqueta text-black/50 hover:bg-black/[0.03] transition"
              >
                <IconPhoto size={13} /> {logoUrl ? "Cambiar" : "Subir logo"}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!complejoId) return;
                    setUploadingLogo(true);
                    try {
                      await deleteLogoProyecto();
                      setLogoUrl(null);
                      setMsg("Logo eliminado.");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Error al eliminar logo");
                    } finally {
                      setUploadingLogo(false);
                    }
                  }}
                  disabled={uploadingLogo}
                  className="flex items-center gap-1 rounded-md border-[0.5px] border-black/15 px-2.5 py-1 text-etiqueta text-estado-atrasado/70 hover:bg-estado-atrasado/5 transition"
                >
                  <IconTrash size={13} /> Quitar
                </button>
              )}
            </div>}
          </div>
        </div>

      <form onSubmit={guardar} className="space-y-4">
        {msg && <div className="rounded-md border-[0.5px] border-estado-pagado/30 bg-estado-pagado/10 p-2 text-base text-estado-pagado">{msg}</div>}
        {error && <div className="rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-2 text-base text-estado-atrasado">{error}</div>}

        <label className="block">
          <span className={labelCls}>Nombre del residencial *</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={!canEdit} className={`${inputCls} mt-1 disabled:bg-black/5`} />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className={labelCls}>País</span>
            <select value={idPais} onChange={(e) => cambiarPais(e.target.value === "" ? "" : Number(e.target.value))} disabled={!canEdit} className={`${inputCls} mt-1 disabled:bg-black/5`}>
              <option value="">—</option>
              {paises.map((p) => (
                <option key={p.Id} value={p.Id}>{p.Nombre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Departamento</span>
            <select value={idDepto} onChange={(e) => cambiarDepto(e.target.value === "" ? "" : Number(e.target.value))} disabled={!canEdit || !idPais} className={`${inputCls} mt-1 disabled:bg-black/5`}>
              <option value="">—</option>
              {deptos.map((d) => (
                <option key={d.Id} value={d.Id}>{d.Nombre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Municipio</span>
            <select value={idMuni} onChange={(e) => setIdMuni(e.target.value === "" ? "" : Number(e.target.value))} disabled={!canEdit || !idDepto} className={`${inputCls} mt-1 disabled:bg-black/5`}>
              <option value="">—</option>
              {munis.map((m) => (
                <option key={m.Id} value={m.Id}>{m.Nombre}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className={labelCls}>Ciudad / zona</span>
          <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} disabled={!canEdit} className={`${inputCls} mt-1 disabled:bg-black/5`} />
        </label>

        <label className="block">
          <span className={labelCls}>Dirección exacta</span>
          <textarea value={direccion} onChange={(e) => setDireccion(e.target.value)} rows={2} disabled={!canEdit} className={`${inputCls} mt-1 disabled:bg-black/5`} />
        </label>

        {canEdit && <div className="flex justify-end">
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar datos del proyecto"}</Button>
        </div>}
      </form>
      </div>
    </Panel>
  );
}
