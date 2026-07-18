import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconCheck, IconArrowLeft, IconArrowRight, IconSearch } from "@tabler/icons-react";
import {
  getPaises,
  getUnidades,
  createPropietario,
  type Pais,
  type Unidad,
  type NuevoPropietarioPayload,
} from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import { inputCls, labelCls } from "../../components/ui/form";

const MOTIVOS = ["compra", "herencia", "donacion", "traspaso", "otro"];

export default function NuevoPropietario() {
  const navigate = useNavigate();
  const [paso, setPaso] = useState(1);
  const [paises, setPaises] = useState<Pais[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Paso 1
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dpiNit, setDpiNit] = useState("");
  const [fechaRegistro, setFechaRegistro] = useState(new Date().toISOString().slice(0, 10));
  const [activo, setActivo] = useState(true);
  // Paso 2
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [idPais, setIdPais] = useState<number | "">("");
  const [direccion, setDireccion] = useState("");
  // Paso 3
  const [unidadSel, setUnidadSel] = useState<string | null>(null);
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState("compra");
  const [buscarUnidad, setBuscarUnidad] = useState("");

  useEffect(() => {
    getPaises().then(setPaises).catch(() => {});
    getUnidades()
      .then((u) => setUnidades(u.filter((x) => x.activo && !x.propietario_actual)))
      .catch(() => {});
  }, []);

  const paso1Ok = nombre.trim() && apellido.trim();
  const paso2Ok = true;

  async function guardar() {
    setError(null);
    setSaving(true);
    try {
      const payload: NuevoPropietarioPayload = {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        dpi_nit: dpiNit.trim() || undefined,
        telefono: telefono.trim() || undefined,
        email: email.trim() || undefined,
        direccion: direccion.trim() || undefined,
        id_pais: idPais === "" ? null : Number(idPais),
        fecha_registro: fechaRegistro,
        activo,
        ...(unidadSel
          ? { asignacion: { id_unidad: unidadSel, fecha_inicio: fechaInicio, motivo } }
          : {}),
      };
      await createPropietario(payload);
      navigate("/residentes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <button
          onClick={() => navigate("/residentes")}
          className="mb-1 flex items-center gap-1 text-base text-black/45 hover:text-ink"
        >
          <IconArrowLeft size={15} /> Residentes
        </button>
        <h1 className="text-lg font-semibold">Nuevo propietario</h1>
      </div>

      <Stepper paso={paso} />

      {error && (
        <div className="rounded-md border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/10 p-3 text-base text-estado-atrasado">
          {error}
        </div>
      )}

      <Panel>
        {paso === 1 && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre *">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Apellido *">
              <input value={apellido} onChange={(e) => setApellido(e.target.value)} className={inputCls} />
            </Field>
            <Field label="DPI / NIT">
              <input value={dpiNit} onChange={(e) => setDpiNit(e.target.value)} className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Fecha de registro">
              <input type="date" value={fechaRegistro} onChange={(e) => setFechaRegistro(e.target.value)} className={inputCls} />
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-base">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Propietario activo
            </label>
          </div>
        )}

        {paso === 2 && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Teléfono *">
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email *">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field label="País de residencia *">
              <input
                list="paises-list"
                value={paises.find((p) => p.id === idPais)?.nombre ?? ""}
                onChange={(e) => {
                  const match = paises.find((p) => p.nombre === e.target.value);
                  setIdPais(match ? match.id : "");
                }}
                placeholder="Buscar país…"
                className={inputCls}
              />
              <datalist id="paises-list">
                {paises.map((p) => (
                  <option key={p.id} value={p.nombre} />
                ))}
              </datalist>
            </Field>
            <Field label="Dirección">
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-4">
            <div>
              <span className={labelCls}>Unidad a asignar (opcional)</span>
              {unidades.length === 0 ? (
                <p className="mt-2 text-base text-black/45">
                  No hay unidades disponibles. Puedes registrar el propietario sin asignar y asignarlo luego.
                </p>
              ) : (
                <>
                  <div className="relative mt-2">
                    <IconSearch size={15} className="absolute left-2 top-1/2 -translate-y-1/2 text-black/30" />
                    <input
                      value={buscarUnidad}
                      onChange={(e) => setBuscarUnidad(e.target.value)}
                      placeholder="Buscar lote, bloque, calle…"
                      className={`${inputCls} w-full py-1.5 pl-7`}
                    />
                  </div>
                  <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
                    {unidades
                      .filter((u) => {
                        if (!buscarUnidad.trim()) return true;
                        const t = buscarUnidad.toLowerCase();
                        return (
                          (u.numero_propiedad ?? u.id).toLowerCase().includes(t) ||
                          u.id.toLowerCase().includes(t) ||
                          (u.bloque ?? "").toLowerCase().includes(t) ||
                          (u.calle ?? "").toLowerCase().includes(t)
                        );
                      })
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setUnidadSel(unidadSel === u.id ? null : u.id)}
                          className={`rounded-md border-[0.5px] p-2.5 text-left transition-colors ${
                            unidadSel === u.id
                              ? "border-sidebar-accent bg-sidebar-accent/8"
                              : "border-black/15 hover:bg-black/5"
                          }`}
                        >
                          <div className="font-mono text-base font-medium">{u.numero_propiedad ?? u.id}</div>
                          <div className="text-etiqueta uppercase text-black/45">
                            Bloque {u.bloque}
                            {u.calle ? ` · ${u.calle}` : ""}
                          </div>
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>

            {unidadSel && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Fecha de inicio *">
                  <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Motivo">
                  <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls}>
                    {MOTIVOS.map((m) => (
                      <option key={m} value={m}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </div>
        )}

        {/* Navegación */}
        <div className="mt-5 flex justify-between border-t-[0.5px] border-black/10 pt-4">
          <Button
            variant="secondary"
            onClick={() => setPaso((p) => p - 1)}
            disabled={paso === 1}
          >
            <IconArrowLeft size={16} /> Atrás
          </Button>
          {paso < 3 ? (
            <Button
              onClick={() => setPaso((p) => p + 1)}
              disabled={(paso === 1 && !paso1Ok) || (paso === 2 && !paso2Ok)}
            >
              Siguiente <IconArrowRight size={16} />
            </Button>
          ) : (
            <Button onClick={guardar} disabled={saving}>
              <IconCheck size={16} /> {saving ? "Guardando…" : "Registrar propietario"}
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Stepper({ paso }: { paso: number }) {
  const pasos = ["Datos personales", "Contacto", "Asignación"];
  return (
    <div className="flex items-center gap-2">
      {pasos.map((label, i) => {
        const n = i + 1;
        const done = paso > n;
        const active = paso === n;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-etiqueta font-semibold ${
                active
                  ? "bg-sidebar-accent text-white"
                  : done
                  ? "bg-estado-pagado text-white"
                  : "bg-black/10 text-black/45"
              }`}
            >
              {done ? <IconCheck size={13} /> : n}
            </div>
            <span className={`text-base ${active ? "font-medium text-ink" : "text-black/45"}`}>
              {label}
            </span>
            {i < pasos.length - 1 && <div className="h-[0.5px] flex-1 bg-black/15" />}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
