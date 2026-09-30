import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";
import type { Integracion } from "../lib/types";

export default function AdminIntegraciones() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Integracion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database.from("integraciones").select("*").order("orden", { ascending: true }).limit(200);
    if (error) setErr((error as any).message);
    setRows((data ?? []) as Integracion[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(id: string, activo: boolean) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, activo } : r)));
    const { error } = await insforge.database.from("integraciones").update({ activo }).eq("id", id);
    if (error) setErr((error as any).message);
  }

  const tabla = (list: Integracion[]) => (
    <div className="card overflow-hidden">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t("admin.integraciones.colIntegration")}</th>
            <th>{t("admin.integraciones.colProvider")}</th>
            <th>{t("admin.integraciones.colRequires")}</th>
            <th>{t("admin.integraciones.colActive")}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="font-medium">{r.nombre}</div>
                <div className="font-mono text-[11px] text-muted">{r.id}</div>
              </td>
              <td className="text-muted">{r.proveedor ?? "—"}</td>
              <td className="font-mono text-[11px] text-muted">{r.requiere ?? "—"}</td>
              <td><input type="checkbox" checked={r.activo} onChange={(e) => toggle(r.id, e.target.checked)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const canales = rows.filter((r) => r.tipo === "canal");
  const apps = rows.filter((r) => r.tipo === "app");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("admin.integraciones.title")}</h1>
        <p className="text-sm text-muted">
          {t("admin.integraciones.subtitle")}
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {loading ? (
        <div className="text-muted">{t("common.loading")}</div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h3 className="font-display font-semibold text-[13px] text-cream">{t("admin.integraciones.sectionChannels")}</h3>
            {tabla(canales)}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-display font-semibold text-[13px] text-cream">{t("admin.integraciones.sectionApps")}</h3>
            {tabla(apps)}
          </div>
        </>
      )}
    </div>
  );
}
