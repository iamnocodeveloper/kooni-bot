import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";
import type { CliToken } from "../lib/types";

export default function Sesiones() {
  const { t, formatDate } = useI18n();
  const [rows, setRows] = useState<CliToken[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await insforge.database.from("cli_tokens").select("id, label, last_used_at, created_at").order("created_at", { ascending: false }).limit(50);
    setRows((data ?? []) as CliToken[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string) {
    await insforge.database.from("cli_tokens").delete().eq("id", id);
    await load();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("ses.title")}</h1>
        <p className="text-sm text-muted">{t("ses.subtitle")}</p>
      </div>
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("ses.col.machine")}</th>
              <th>{t("ses.col.authorized")}</th>
              <th>{t("ses.col.lastUsed")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-muted">{t("common.loading")}</td>
              </tr>
            )}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="text-muted">{t("ses.empty")}</td>
              </tr>
            )}
            {rows.map((tok) => (
              <tr key={tok.id}>
                <td className="max-w-xs truncate">{tok.label ?? "—"}</td>
                <td className="text-muted">{formatDate(tok.created_at)}</td>
                <td className="text-muted">{tok.last_used_at ? formatDate(tok.last_used_at) : t("common.never")}</td>
                <td className="text-right">
                  <button className="btn-danger py-1" onClick={() => revoke(tok.id)}>{t("common.revoke")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
