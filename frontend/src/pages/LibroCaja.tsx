import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconArrowLeft, IconArrowDownRight, IconArrowUpRight, IconPrinter, IconLock, IconLockOpen, IconFileText, IconUpload } from "@tabler/icons-react";
import { getLibroCaja, getCierres, cerrarPeriodo, reabrirPeriodo, subirComprobanteCierre, type LibroCaja as LibroCajaData, type CierrePeriodo } from "../api/client";
import { useAuth } from "../stores/authStore";
import Panel from "../components/ui/Panel";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import MonoAmount from "../components/ui/MonoAmount";
import { inputCls, labelCls } from "../components/ui/form";
import { formatDate } from "../utils/formatters";

export default function LibroCaja() {
  const rol = useAuth((s) => s.user?.rol);
  const puedeGestionar = rol === "admin" || rol === "superadmin";
  const puedeReabrir = rol === "superadmin";

  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<LibroCajaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cierres, setCierres] = useState<CierrePeriodo[]>([]);
  const [showReabrir, setShowReabrir] = useState(false);
  const [showCerrar, setShowCerrar] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const cierre = cierres.find((c) => c.periodo === periodo);
  const cerrado = !!cierre?.cerrado;

  const cargarCierres = () => getCierres().then(setCierres).catch(() => setCierres([]));

  useEffect(() => {
    setLoading(true);
    getLibroCaja(periodo).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [periodo]);

  useEffect(() => { cargarCierres(); }, []);

  const onCerrar = async (file: File) => {
    const r = await cerrarPeriodo(periodo, file);
    await cargarCierres();
    setShowCerrar(false);
    alert(r.email.configured
      ? `Período ${periodo} cerrado. Se notificó a la directiva (${r.email.sent} correo(s)).`
      : `Período ${periodo} cerrado. (Correo a directiva no enviado: SMTP no configurado.)`);
  };

  const onReabrir = async (datos: { solicitado_por: string; motivo: string }) => {
    await reabrirPeriodo(periodo, datos);
    await cargarCierres();
    setShowReabrir(false);
  };

  const onSubirComprobante = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (file.type !== "application/pdf") { alert("El comprobante debe ser un archivo PDF."); return; }
    setSubiendo(true);
    try {
      await subirComprobanteCierre(periodo, file);
      await cargarCierres();
    } catch (err) {
      alert((err as Error).message || "No se pudo subir el comprobante");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-black/40 hover:text-ink" title="Volver al dashboard"><IconArrowLeft size={18} /></Link>
            <h1 className="text-lg font-semibold">Libro de caja</h1>
          </div>
          <p className="text-base text-black/50">Movimientos del mes: saldo inicial, ingresos, egresos y saldo corriente</p>
        </div>
        <div className="flex items-end gap-2">
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
            className={`${inputCls} w-44 py-1.5 font-mono`} />
          <a href={`/libro-caja/pdf?periodo=${periodo}`} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary"><IconPrinter size={16} /> Imprimir / PDF</Button>
          </a>
          {!cerrado && puedeGestionar && (
            <Button variant="primary" onClick={() => setShowCerrar(true)}><IconLock size={16} /> Cerrar mes</Button>
          )}
          {cerrado && puedeReabrir && (
            <Button variant="secondary" onClick={() => setShowReabrir(true)}><IconLockOpen size={16} /> Reabrir</Button>
          )}
        </div>
      </div>

      {cerrado && (
        <div className="flex items-start gap-2 rounded-lg border-[0.5px] border-estado-atrasado/30 bg-estado-atrasado/5 px-4 py-2.5 text-base text-ink">
          <IconLock size={17} className="mt-0.5 shrink-0 text-estado-atrasado" />
          <div>
            <span className="font-medium">Mes cerrado contablemente.</span>{" "}
            No se pueden registrar ni modificar gastos, cargos ni pagos de {periodo}.
            {cierre?.cerrado_por && <span className="text-black/50"> · Cerrado por {cierre.cerrado_por}{cierre.cerrado_at ? ` el ${formatDate(cierre.cerrado_at)}` : ""}.</span>}
            {!puedeReabrir && <span className="text-black/50"> Solo el superadministrador puede reabrirlo.</span>}
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {cierre?.comprobante_url ? (
                <a href={cierre.comprobante_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sidebar-accent hover:underline">
                  <IconFileText size={14} /> {cierre.comprobante_nombre ?? "Comprobante bancario"}
                </a>
              ) : (
                <span className="text-black/45">Sin comprobante bancario adjunto.</span>
              )}
              {puedeGestionar && (
                <label className={`inline-flex cursor-pointer items-center gap-1 text-sidebar-accent hover:underline ${subiendo ? "pointer-events-none opacity-50" : ""}`}>
                  <IconUpload size={14} />
                  {subiendo ? "Subiendo…" : cierre?.comprobante_url ? "Reemplazar comprobante" : "Subir comprobante"}
                  <input type="file" accept="application/pdf" className="hidden" onChange={onSubirComprobante} />
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {!cerrado && cierre?.reabierto_at && (
        <div className="flex items-start gap-2 rounded-lg border-[0.5px] border-black/10 bg-black/[0.02] px-4 py-2.5 text-base text-black/60">
          <IconLockOpen size={17} className="mt-0.5 shrink-0 text-black/40" />
          <div>
            <span className="font-medium text-ink">Período reabierto.</span>{" "}
            {cierre.reabierto_por && <>Por {cierre.reabierto_por} el {formatDate(cierre.reabierto_at)}. </>}
            {cierre.reabierto_solicitado_por && <>A solicitud de <span className="font-medium">{cierre.reabierto_solicitado_por}</span>. </>}
            {cierre.reabierto_motivo && <>Motivo: <span className="italic">{cierre.reabierto_motivo}</span></>}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Saldo inicial" value={data?.saldo_inicial ?? 0} />
        <Kpi label="Ingresos del mes" value={data?.total_ingresos ?? 0} tone="text-estado-pagado" />
        <Kpi label="Egresos del mes" value={data?.total_egresos ?? 0} tone="text-estado-atrasado" />
        <Kpi label="Saldo final" value={data?.saldo_final ?? 0} tone="text-ink" strong />
      </div>

      <Panel title={`Movimientos · ${periodo}`}>
        {loading ? (
          <div className="py-8 text-center text-base text-black/40">Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-tabla">
              <thead>
                <tr className="border-b-[0.5px] border-black/15 text-left text-black/45">
                  <th className="py-1.5 font-medium">Fecha</th>
                  <th className="py-1.5 font-medium">Descripción</th>
                  <th className="py-1.5 text-right font-medium">Ingreso</th>
                  <th className="py-1.5 text-right font-medium">Egreso</th>
                  <th className="py-1.5 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {/* Saldo inicial */}
                <tr className="border-b-[0.5px] border-black/10 bg-black/[0.02]">
                  <td className="py-2 text-black/50">—</td>
                  <td className="py-2 font-medium text-black/60">Saldo inicial</td>
                  <td className="py-2"></td>
                  <td className="py-2"></td>
                  <td className="py-2 text-right"><MonoAmount value={data?.saldo_inicial ?? 0} className="font-semibold" /></td>
                </tr>
                {(data?.movimientos ?? []).map((m, i) => (
                  <tr key={i} className="border-b-[0.5px] border-black/5">
                    <td className="py-2 font-mono text-black/60">{formatDate(m.fecha)}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5">
                        {m.tipo === "pago"
                          ? <IconArrowUpRight size={13} className="text-estado-pagado" />
                          : <IconArrowDownRight size={13} className="text-estado-atrasado" />}
                        {m.descripcion}
                      </span>
                      {m.detalle && <div className="text-etiqueta text-black/40">{m.detalle}</div>}
                    </td>
                    <td className="py-2 text-right">{m.ingreso > 0 ? <MonoAmount value={m.ingreso} className="text-estado-pagado" /> : <span className="text-black/20">—</span>}</td>
                    <td className="py-2 text-right">{m.egreso > 0 ? <MonoAmount value={m.egreso} className="text-estado-atrasado" /> : <span className="text-black/20">—</span>}</td>
                    <td className="py-2 text-right"><MonoAmount value={m.saldo} className={m.saldo < 0 ? "text-estado-atrasado" : ""} /></td>
                  </tr>
                ))}
                {data && data.movimientos.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-base text-black/40">Sin movimientos en este mes</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-[0.5px] border-black/20 font-semibold">
                  <td className="py-2" colSpan={2}>Saldo final del mes</td>
                  <td className="py-2 text-right text-estado-pagado"><MonoAmount value={data?.total_ingresos ?? 0} /></td>
                  <td className="py-2 text-right text-estado-atrasado"><MonoAmount value={data?.total_egresos ?? 0} /></td>
                  <td className="py-2 text-right"><MonoAmount value={data?.saldo_final ?? 0} className="text-ink" /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {showCerrar && (
        <CerrarModal periodo={periodo} onClose={() => setShowCerrar(false)} onConfirm={onCerrar} />
      )}
      {showReabrir && (
        <ReabrirModal periodo={periodo} onClose={() => setShowReabrir(false)} onConfirm={onReabrir} />
      )}
    </div>
  );
}

function CerrarModal({
  periodo,
  onClose,
  onConfirm,
}: {
  periodo: string;
  onClose: () => void;
  onConfirm: (file: File) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Adjunta el comprobante bancario (PDF)."); return; }
    if (file.type !== "application/pdf") { setError("El comprobante debe ser un archivo PDF."); return; }
    setError(null);
    setSaving(true);
    try {
      await onConfirm(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar el período");
      setSaving(false);
    }
  }

  return (
    <Modal title={`Cerrar ${periodo}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <p className="text-base text-black/55">
          Una vez cerrado, no se podrán registrar ni modificar gastos, cargos ni pagos de este mes.
          Se enviará un correo a la directiva con el detalle del libro de caja.
        </p>
        <label className="block">
          <span className={labelCls}>Comprobante bancario (PDF) *</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
            required
            className={`${inputCls} mt-1`}
          />
          <span className="mt-1 block text-etiqueta text-black/45">
            Estado de cuenta del banco del mes, para conciliar luego sistema vs banco.
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving || !file}>
            {saving ? "Cerrando…" : "Cerrar mes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReabrirModal({
  periodo,
  onClose,
  onConfirm,
}: {
  periodo: string;
  onClose: () => void;
  onConfirm: (datos: { solicitado_por: string; motivo: string }) => Promise<void>;
}) {
  const [solicitadoPor, setSolicitadoPor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!solicitadoPor.trim() || !motivo.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await onConfirm({ solicitado_por: solicitadoPor.trim(), motivo: motivo.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reabrir el período");
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reabrir ${periodo}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-base text-estado-atrasado">{error}</div>}
        <p className="text-base text-black/55">
          Se permitirá nuevamente registrar y modificar movimientos de este mes. Queda registrado a solicitud de quién y por qué.
        </p>
        <label className="block">
          <span className={labelCls}>A solicitud de *</span>
          <input
            value={solicitadoPor}
            onChange={(e) => setSolicitadoPor(e.target.value)}
            placeholder="Nombre de quien solicita la reapertura"
            required
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Motivo *</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. corrección de un gasto mal registrado"
            required
            rows={3}
            className={`${inputCls} mt-1 resize-none`}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" disabled={saving || !solicitadoPor.trim() || !motivo.trim()}>
            {saving ? "Reabriendo…" : "Reabrir mes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Kpi({ label, value, tone = "text-ink", strong }: { label: string; value: number; tone?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border-[0.5px] bg-white p-3.5 shadow-sm ${strong ? "border-sidebar-accent/40" : "border-black/15"}`}>
      <div className="mb-1 text-etiqueta uppercase tracking-wide text-black/45">{label}</div>
      <MonoAmount value={value} className={`text-lg font-semibold ${tone}`} />
    </div>
  );
}
