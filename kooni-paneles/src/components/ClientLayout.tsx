import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";
import { useI18n, type MessageKey } from "../lib/i18n";
import LanguageSelect from "./LanguageSelect";

const NAV: { to: string; key: MessageKey; end?: boolean }[] = [
  { to: "/", key: "nav.client.bots", end: true },
  { to: "/vinculacion", key: "nav.client.vinculacion" },
  { to: "/novedades", key: "nav.client.novedades" },
  { to: "/plantillas", key: "nav.client.plantillas" },
  { to: "/cli", key: "nav.client.cli" },
  { to: "/sesiones", key: "nav.client.sesiones" },
  { to: "/configuracion", key: "nav.client.config" },
  { to: "/plan", key: "nav.client.plan" },
];

export default function ClientLayout({ children }: { children: ReactNode }) {
  const { profile, isAdmin } = useAuth();
  const { t } = useI18n();
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
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 border-t border-line pt-4 text-xs text-muted">
          <div className="truncate">{profile?.email}</div>
          {isAdmin && (
            <NavLink to="/admin" className="mt-2 block text-accent hover:underline">
              {t("nav.toAdmin")}
            </NavLink>
          )}
          <button onClick={logout} className="mt-2 text-bad hover:underline">
            {t("nav.logout")}
          </button>
          <LanguageSelect className="mt-3 w-full" />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
