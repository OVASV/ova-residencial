import { useEffect, useState } from "react";
import { IconBrandWhatsapp, IconSend } from "@tabler/icons-react";
import { getConfigWhatsapp, saveConfigWhatsapp, testConfigWhatsapp, type ConfigWhatsapp } from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import { inputCls, labelCls } from "../../components/ui/form";

export default function WhatsappTab() {
  const [cfg, setCfg] = useState<ConfigWhatsapp | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");
  const [numero, setNumero] = useState("");
  const [apiVersion, setApiVersion] = useState("v21.0");
  const [activo, setActivo] = useState(true);
  const [testDest, setTestDest] = useState("");

  useEffect(() => {
    getConfigWhatsapp()
      .then((c) => {
        if (c) {
          setCfg(c);
          setPhoneNumberId(c.phone_number_id);
          setNumero(c.numero_visible ?? "");
          setApiVersion(c.api_version);
          setActivo(c.activo);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const result = await saveConfigWhatsapp({
        phone_number_id: phoneNumberId,
        ...(token ? { access_token: token } : {}),
        numero_visible: numero || undefined,
        api_version: apiVersion || undefined,
        activo,
      });
      setCfg(result);
      setToken("");
      setMsg({ ok: true, text: "Configuración guardada" });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMsg(null);
    try {
      const r = await testConfigWhatsapp(testDest);
      setMsg({ ok: r.ok, text: r.message });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Error al enviar prueba" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-base text-black/40">Cargando…</div>;

  return (
    <Panel>
      <div className="flex items-center gap-2 mb-4">
        <IconBrandWhatsapp size={18} className="text-black/40" />
        <h2 className="text-base font-semibold">WhatsApp Cloud API</h2>
        {cfg && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${activo ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
            {activo ? "Activo" : "Inactivo"}
          </span>
        )}
      </div>

      <p className="mb-4 rounded-md bg-black/[0.03] px-3 py-2 text-xs text-black/55">
        El envío en frío usa <b>plantillas aprobadas</b> en WhatsApp Manager. Crea las plantillas
        <span className="font-mono"> recordatorio_pago</span> y <span className="font-mono">aviso_mora</span> (idioma es) para que
        los avisos se despachen. El <b>Phone Number ID</b> y el token se obtienen en Meta &gt; WhatsApp &gt; API Setup.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Phone Number ID</label>
          <input className={inputCls} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="123456789012345" />
        </div>
        <div>
          <label className={labelCls}>Número visible (referencia)</label>
          <input className={inputCls} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="50368326586" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Token de acceso {cfg?.token_set && <span className="text-black/30 font-normal">(ya configurado)</span>}</label>
          <input className={inputCls} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg?.token_set ? "••••••••" : "Token permanente de System User"} />
        </div>
        <div>
          <label className={labelCls}>Versión de API</label>
          <input className={inputCls} value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} placeholder="v21.0" />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="rounded" />
            Habilitado
          </label>
        </div>
      </div>

      {msg && (
        <div className={`mt-3 text-sm px-3 py-2 rounded ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </div>
      )}

      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-black/8">
        <Button onClick={handleSave} disabled={saving || !phoneNumberId}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <input
            className={inputCls + " !w-48"}
            value={testDest}
            onChange={(e) => setTestDest(e.target.value)}
            placeholder="Número de prueba (503…)"
          />
          <Button variant="secondary" onClick={handleTest} disabled={testing || !cfg || !testDest}>
            <IconSend size={14} />
            {testing ? "Enviando…" : "Probar"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
