import type { ReactNode } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./stores/authStore";
import MainLayout from "./components/layout/MainLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LibroCaja from "./pages/LibroCaja";
import LibroCajaPDF from "./pages/LibroCajaPDF";
import EstadoSistema from "./pages/EstadoSistema";
import Residentes from "./pages/residentes/Residentes";
import NuevoPropietario from "./pages/residentes/NuevoPropietario";
import MapaComplejo from "./pages/residentes/MapaComplejo";
import Configuracion from "./pages/configuracion/Configuracion";
import Complejos from "./pages/complejos/Complejos";
import Pagos from "./pages/pagos/Pagos";
import EstadoCuenta from "./pages/pagos/EstadoCuenta";
import EstadoCuentaPDF from "./pages/pagos/EstadoCuentaPDF";
import ReciboPDF from "./pages/pagos/ReciboPDF";
import Recibos from "./pages/pagos/Recibos";
import Conciliacion from "./pages/pagos/Conciliacion";
import TrasladosX01 from "./pages/pagos/TrasladosX01";
import Cobranza from "./pages/cobranza/Cobranza";
import Bitacora from "./pages/cobranza/Bitacora";
import Gastos from "./pages/gastos/Gastos";
import ReporteGastos from "./pages/gastos/ReporteGastos";
import Avisos from "./pages/avisos/Avisos";
import DetalleDeuda from "./pages/DetalleDeuda";
import PortalInicio from "./pages/portal/PortalInicio";
import MiEstadoCuenta from "./pages/portal/MiEstadoCuenta";
import MiMapa from "./pages/portal/MiMapa";
import MisMensajes from "./pages/portal/MisMensajes";
import Transparencia from "./pages/portal/Transparencia";
import BuzonAdmin from "./pages/buzon/BuzonAdmin";

function PortalOrDashboard() {
  const rol = useAuth((s) => s.user?.rol);
  return rol === "propietario" ? <PortalInicio /> : <Dashboard />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const rol = useAuth((s) => s.user?.rol);
  if (rol && !roles.includes(rol)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const FULL = ["superadmin", "admin", "lectura"];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/pagos/estado-cuenta/:idUnidad/pdf" element={<RequireAuth><EstadoCuentaPDF /></RequireAuth>} />
      <Route path="/pagos/recibo/pdf" element={<RequireAuth><ReciboPDF /></RequireAuth>} />
      <Route path="/gastos/reporte" element={<RequireAuth><ReporteGastos /></RequireAuth>} />
      <Route path="/libro-caja/pdf" element={<RequireAuth><LibroCajaPDF /></RequireAuth>} />

      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<PortalOrDashboard />} />
        <Route path="residentes" element={<RequireRole roles={FULL}><Residentes /></RequireRole>} />
        <Route path="residentes/nuevo" element={<RequireRole roles={FULL}><NuevoPropietario /></RequireRole>} />
        <Route path="residentes/mapa" element={<RequireRole roles={[...FULL, "directiva"]}><MapaComplejo /></RequireRole>} />
        <Route path="residentes/mapa-editar" element={<RequireRole roles={FULL}><MapaComplejo editable /></RequireRole>} />
        <Route path="deuda" element={<RequireRole roles={[...FULL, "directiva"]}><DetalleDeuda /></RequireRole>} />
        <Route path="pagos" element={<RequireRole roles={FULL}><Pagos /></RequireRole>} />
        <Route path="pagos/estado-cuenta/:idUnidad" element={<RequireRole roles={FULL}><EstadoCuenta /></RequireRole>} />
        <Route path="pagos/conciliacion" element={<RequireRole roles={FULL}><Conciliacion /></RequireRole>} />
        <Route path="pagos/traslados" element={<RequireRole roles={FULL}><TrasladosX01 /></RequireRole>} />
        <Route path="cobranza" element={<RequireRole roles={[...FULL, "directiva"]}><Cobranza /></RequireRole>} />
        <Route path="libro-caja" element={<RequireRole roles={[...FULL, "directiva"]}><LibroCaja /></RequireRole>} />
        <Route path="cobranza/bitacora" element={<RequireRole roles={[...FULL, "directiva"]}><Bitacora /></RequireRole>} />
        <Route path="pagos/recibos" element={<RequireRole roles={FULL}><Recibos /></RequireRole>} />
        <Route path="gastos" element={<RequireRole roles={[...FULL, "directiva"]}><Gastos /></RequireRole>} />

        {/* Portal propietario */}
        <Route path="mi-estado-cuenta" element={<RequireRole roles={["propietario"]}><MiEstadoCuenta /></RequireRole>} />
        <Route path="mi-mapa" element={<RequireRole roles={["propietario"]}><MiMapa /></RequireRole>} />
        <Route path="mis-mensajes" element={<RequireRole roles={["propietario"]}><MisMensajes /></RequireRole>} />
        <Route path="transparencia" element={<Transparencia />} />

        {/* Admin buzón */}
        <Route path="notificaciones" element={<RequireRole roles={["superadmin", "admin", "directiva"]}><BuzonAdmin /></RequireRole>} />

        <Route path="avisos" element={<RequireRole roles={[...FULL, "directiva"]}><Avisos /></RequireRole>} />
        <Route path="complejos" element={<RequireRole roles={["superadmin"]}><Complejos /></RequireRole>} />
        <Route path="configuracion" element={<RequireRole roles={["superadmin", "admin"]}><Configuracion /></RequireRole>} />
        <Route path="sistema" element={<RequireRole roles={FULL}><EstadoSistema /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
