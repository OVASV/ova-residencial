import { useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { login } from "../api/client";
import { useAuth } from "../stores/authStore";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuth((s) => s.setSession);

  const [email, setEmail] = useState("admin@lospinos.gt");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await login(email, password);
      setSession(data);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de inicio de sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar-bg">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-xl shadow-lg p-8 w-[340px] space-y-4"
      >
        <div className="text-center mb-2">
          <img src="/logo-ova.png" alt="OVA" className="h-12 mx-auto mb-2 object-contain" />
          <div className="text-etiqueta uppercase tracking-wide text-black/40">Iniciar sesión</div>
        </div>

        {error && (
          <div className="bg-estado-atrasado/10 text-estado-atrasado border border-estado-atrasado/30 rounded-md p-2 text-base">
            {error}
          </div>
        )}

        <label className="block">
          <span className="text-etiqueta uppercase tracking-wide text-black/50">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full border border-black/15 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-sidebar-accent/40"
          />
        </label>

        <label className="block">
          <span className="text-etiqueta uppercase tracking-wide text-black/50">Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full border border-black/15 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-sidebar-accent/40"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sidebar-accent text-white rounded-md py-2 text-base font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
