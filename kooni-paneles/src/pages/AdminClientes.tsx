import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";
import type { Profile } from "../lib/types";

export default function AdminClientes() {
  const { t, formatDate } = useI18n();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database.from("profiles").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) setErr((error as any).message);
    setRows((data ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function setRole(id: string, role: string) {
    const { error } = await insforge.database.from("profiles").update({ role }).eq("id", id);
    if (error) setErr((error as any).message);
    await load();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("admin.clientes.title")}</h1>
        <p className="text-sm text-muted">{t("admin.clientes.subtitle")}</p>
      </div>
      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("admin.clientes.colEmail")}</th>
              <th>{t("admin.clientes.colName")}</th>
              <th>{t("admin.clientes.colRole")}</th>
              <th>{t("admin.clientes.colAlta")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-muted">{t("common.loading")}</td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-[12px]">{p.email}</td>
                <td>{p.display_name ?? "—"}</td>
                <td>
                  <select className="input py-1 text-xs" value={p.role} onChange={(e) => setRole(p.id, e.target.value)}>
                    <option value="cliente">{t("admin.clientes.roleCliente")}</option>
                    <option value="revendedor">{t("admin.clientes.roleRevendedor")}</option>
                    <option value="admin">{t("admin.clientes.roleAdmin")}</option>
                  </select>
                </td>
                <td className="text-muted">{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
