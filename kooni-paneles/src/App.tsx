import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import ClientLayout from "./components/ClientLayout";
import AdminLayout from "./components/AdminLayout";
import Login from "./pages/Login";
import Cuenta from "./pages/Cuenta";
import Vinculacion from "./pages/Vinculacion";
import Novedades from "./pages/Novedades";
import Plantillas from "./pages/Plantillas";
import Configuracion from "./pages/Configuracion";
import PlanPage from "./pages/Plan";
import Invitacion from "./pages/Invitacion";
import Cli from "./pages/Cli";
import Sesiones from "./pages/Sesiones";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLicencias from "./pages/AdminLicencias";
import AdminInstalaciones from "./pages/AdminInstalaciones";
import AdminModulos from "./pages/AdminModulos";
import AdminClientes from "./pages/AdminClientes";
import AdminNovedades from "./pages/AdminNovedades";
import AdminPlanes from "./pages/AdminPlanes";
import AdminFacturacion from "./pages/AdminFacturacion";
import AdminPagos from "./pages/AdminPagos";
import AdminDominios from "./pages/AdminDominios";
import AdminIA from "./pages/AdminIA";

function Spinner() {
  return <div className="flex h-full items-center justify-center text-muted">Cargando…</div>;
}

function NoAccess() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="card max-w-md p-6 text-center">
        <div className="text-lg font-semibold">Sin acceso</div>
        <p className="mt-2 text-sm text-muted">Tu cuenta no tiene rol de super admin.</p>
      </div>
    </div>
  );
}

export default function App() {
  const { loading, user, isAdmin } = useAuth();

  if (loading) return <Spinner />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={isAdmin ? "/admin" : "/"} replace /> : <Login />} />
      <Route path="/invitacion" element={<Invitacion />} />

      {/* Área super admin */}
      <Route
        path="/admin/*"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : !isAdmin ? (
            <NoAccess />
          ) : (
            <AdminLayout>
              <Routes>
                <Route index element={<AdminDashboard />} />
                <Route path="licencias" element={<AdminLicencias />} />
                <Route path="instalaciones" element={<AdminInstalaciones />} />
                <Route path="modulos" element={<AdminModulos />} />
                <Route path="clientes" element={<AdminClientes />} />
                <Route path="novedades" element={<AdminNovedades />} />
                <Route path="planes" element={<AdminPlanes />} />
                <Route path="facturacion" element={<AdminFacturacion />} />
                <Route path="pagos" element={<AdminPagos />} />
                <Route path="dominios" element={<AdminDominios />} />
                <Route path="ia" element={<AdminIA />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </AdminLayout>
          )
        }
      />

      {/* Área cliente */}
      <Route
        path="/*"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : (
            <ClientLayout>
              <Routes>
                <Route index element={<Cuenta />} />
                <Route path="vinculacion" element={<Vinculacion />} />
                <Route path="novedades" element={<Novedades />} />
                <Route path="plantillas" element={<Plantillas />} />
                <Route path="configuracion" element={<Configuracion />} />
                <Route path="plan" element={<PlanPage />} />
                <Route path="cli" element={<Cli />} />
                <Route path="sesiones" element={<Sesiones />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ClientLayout>
          )
        }
      />
    </Routes>
  );
}
