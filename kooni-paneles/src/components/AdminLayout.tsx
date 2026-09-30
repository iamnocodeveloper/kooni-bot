import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";
import { useI18n, type MessageKey } from "../lib/i18n";
import LanguageSelect from "./LanguageSelect";

const NAV: { to: string; key: MessageKey; end?: boolean }[] = [
  { to: "/admin", key: "nav.admin.resumen", end: true },
  { to: "/admin/licencias", key: "nav.admin.licencias" },
  { to: "/admin/instalaciones", key: "nav.admin.instalaciones" },
  { to: "/admin/modulos", key: "nav.admin.modulos" },
  { to: "/admin/novedades", key: "nav.admin.novedades" },
  { to: "/admin/planes", key: "nav.admin.planes" },
  { to: "/admin/facturacion", key: "nav.admin.facturacion" },
  { to: "/admin/pagos", key: "nav.admin.pagos" },
  { to: "/admin/dominios", key: "nav.admin.dominios" },
  { to: "/admin/ia", key: "nav.admin.ia" },
  { to: "/admin/comandos", key: "nav.admin.comandos" },
  { to: "/admin/integraciones", key: "nav.admin.integraciones" },
  { to: "/admin/packs", key: "nav.admin.packs" },
  { to: "/admin/revendedores", key: "nav.admin.revendedores" },
  { to: "/admin/soporte", key: "nav.admin.soporte" },
  { to: "/admin/estadisticas", key: "nav.admin.estadisticas" },
  { to: "/admin/configuracion", key: "nav.admin.configuracion" },
  { to: "/admin/auditoria", key: "nav.admin.auditoria" },
  { to: "/admin/equipo", key: "nav.admin.equipo" },
  { to: "/admin/clientes", key: "nav.admin.clientes" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
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
          <span className="chip bg-accentSoft text-accent">{t("nav.superAdmin")}</span>
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
          <NavLink to="/" className="mt-2 block text-accent hover:underline">
            {t("nav.toAccount")}
          </NavLink>
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
