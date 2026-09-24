import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/", label: "Mis bots", end: true },
  { to: "/vinculacion", label: "Vinculación" },
  { to: "/novedades", label: "Novedades" },
  { to: "/plantillas", label: "Plantillas" },
  { to: "/cli", label: "Conectar CLI" },
  { to: "/sesiones", label: "Sesiones del CLI" },
  { to: "/configuracion", label: "Configuración" },
  { to: "/plan", label: "Mi plan" },
];

export default function ClientLayout({ children }: { children: ReactNode }) {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    await insforge.auth.signOut().catch(() => {});
    navigate("/login");
    location.reload();
  }

  return (
    <div className="flex min-h-full">
      <aside className="w-60 shrink-0 border-r border-line bg-panel2 p-4">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-accent">◆</span>
          <span className="font-display font-semibold">Kooni</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-accentSoft text-accent" : "text-muted hover:bg-panel hover:text-cream"}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 border-t border-line pt-4 text-xs text-muted">
          <div className="truncate">{profile?.email}</div>
          {isAdmin && (
            <NavLink to="/admin" className="mt-2 block text-accent hover:underline">
              Ir al super admin
            </NavLink>
          )}
          <button onClick={logout} className="mt-2 text-bad hover:underline">
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
