import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";
import type { Comando } from "../lib/types";

export default function AdminComandos() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Comando[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database.from("comandos_catalogo").select("*").order("orden", { ascending: true }).limit(200);
    if (error) setErr((error as any).message);
    setRows((data ?? []) as Comando[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(id: string, fields: Partial<Comando>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    const { error } = await insforge.database.from("comandos_catalogo").update(fields).eq("id", id);
    if (error) setErr((error as any).message);
  }

  const terminal = rows.filter((r) => r.tipo === "terminal");
  const agente = rows.filter((r) => r.tipo === "agente");

  const tabla = (list: Comando[]) => (
    <div className="card overflow-hidden">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t("admin.comandos.colCommand")}</th>
            <th>{t("admin.comandos.colDescription")}</th>
            <th>{t("admin.comandos.colPro")}</th>
            <th>{t("admin.comandos.colActive")}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td className="font-mono text-[12px]">{c.comando}</td>
              <td>
                <input
                  className="input py-1 text-xs"
                  value={c.descripcion ?? ""}
                  onChange={(e) => patch(c.id, { descripcion: e.target.value })}
                />
              </td>
              <td><input type="checkbox" checked={c.requiere_pro} onChange={(e) => patch(c.id, { requiere_pro: e.target.checked })} /></td>
              <td><input type="checkbox" checked={c.activo} onChange={(e) => patch(c.id, { activo: e.target.checked })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("admin.comandos.title")}</h1>
        <p className="text-sm text-muted">
          {t("admin.comandos.subtitlePre")}<b className="text-cream">{t("admin.comandos.subtitleBold")}</b>{t("admin.comandos.subtitlePost")}
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {loading ? (
        <div className="text-muted">{t("common.loading")}</div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h3 className="font-display font-semibold text-[13px] text-cream">{t("admin.comandos.sectionTerminal")}</h3>
            {tabla(terminal)}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-display font-semibold text-[13px] text-cream">{t("admin.comandos.sectionAgent")}</h3>
            {tabla(agente)}
          </div>
        </>
      )}
    </div>
  );
}
