import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/admin", label: "Resumen", end: true },
  { to: "/admin/licencias", label: "Licencias" },
  { to: "/admin/instalaciones", label: "Instalaciones" },
  { to: "/admin/modulos", label: "Módulos" },
  { to: "/admin/clientes", label: "Clientes" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
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
          <span className="chip bg-accentSoft text-accent">super admin</span>
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
          <NavLink to="/" className="mt-2 block text-accent hover:underline">
            Ir a mi cuenta
          </NavLink>
          <button onClick={logout} className="mt-2 text-bad hover:underline">
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
