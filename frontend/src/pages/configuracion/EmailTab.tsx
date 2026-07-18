import { useEffect, useState } from "react";
import { IconMail, IconSend } from "@tabler/icons-react";
import { getConfigEmail, saveConfigEmail, testConfigEmail, type ConfigEmail } from "../../api/client";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import { inputCls, labelCls } from "../../components/ui/form";

export default function EmailTab() {
  const [cfg, setCfg] = useState<ConfigEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [activo, setActivo] = useState(true);
  const [testDest, setTestDest] = useState("");

  useEffect(() => {
    getConfigEmail()
      .then((c) => {
        if (c) {
          setCfg(c);
          setHost(c.smtp_host);
          setPort(c.smtp_port);
          setSecure(c.smtp_secure);
          setUser(c.smtp_user);
          setFromName(c.from_name ?? "");
          setFromEmail(c.from_email);
          setActivo(c.activo);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const result = await saveConfigEmail({
        smtp_host: host,
        smtp_port: port,
        smtp_secure: secure,
        smtp_user: user,
        ...(pass ? { smtp_pass: pass } : {}),
        from_name: fromName || undefined,
        from_email: fromEmail,
        activo,
      });
      setCfg(result);
      setPass("");
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
      const r = await testConfigEmail(testDest || undefined);
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
        <IconMail size={18} className="text-black/40" />
        <h2 className="text-base font-semibold">Configuración SMTP</h2>
        {cfg && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${activo ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
            {activo ? "Activo" : "Inactivo"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Servidor SMTP</label>
          <input className={inputCls} value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Puerto</label>
            <input className={inputCls} type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="rounded" />
              SSL/TLS
            </label>
          </div>
        </div>
        <div>
          <label className={labelCls}>Usuario SMTP</label>
          <input className={inputCls} value={user} onChange={(e) => setUser(e.target.value)} placeholder="correo@gmail.com" />
        </div>
        <div>
          <label className={labelCls}>Contraseña {cfg?.smtp_pass_set && <span className="text-black/30 font-normal">(ya configurada)</span>}</label>
          <input className={inputCls} type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={cfg?.smtp_pass_set ? "••••••••" : "Contraseña SMTP"} />
        </div>
        <div>
          <label className={labelCls}>Nombre remitente</label>
          <input className={inputCls} value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Nombre del residencial" />
        </div>
        <div>
          <label className={labelCls}>Email remitente</label>
          <input className={inputCls} value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="avisos@lospinos.gt" />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="rounded" />
          Habilitado
        </label>
      </div>

      {msg && (
        <div className={`mt-3 text-sm px-3 py-2 rounded ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </div>
      )}

      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-black/8">
        <Button onClick={handleSave} disabled={saving || !host || !user || !fromEmail}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <input
            className={inputCls + " !w-48"}
            value={testDest}
            onChange={(e) => setTestDest(e.target.value)}
            placeholder="Email de prueba"
          />
          <Button variant="secondary" onClick={handleTest} disabled={testing || !cfg}>
            <IconSend size={14} />
            {testing ? "Enviando…" : "Probar"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
