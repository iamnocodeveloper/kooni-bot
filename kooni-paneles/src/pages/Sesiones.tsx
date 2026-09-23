import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { CliToken } from "../lib/types";

export default function Sesiones() {
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
        <h1 className="font-display text-xl font-semibold">Sesiones del CLI</h1>
        <p className="text-sm text-muted">Máquinas autorizadas a instalar/actualizar tus bots. Revoca las que no reconozcas.</p>
      </div>
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Máquina</th>
              <th>Autorizada</th>
              <th>Último uso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-muted">Cargando…</td>
              </tr>
            )}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="text-muted">Sin sesiones del CLI.</td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="max-w-xs truncate">{t.label ?? "—"}</td>
                <td className="text-muted">{new Date(t.created_at).toLocaleDateString("es")}</td>
                <td className="text-muted">{t.last_used_at ? new Date(t.last_used_at).toLocaleDateString("es") : "nunca"}</td>
                <td className="text-right">
                  <button className="btn-danger py-1" onClick={() => revoke(t.id)}>Revocar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
