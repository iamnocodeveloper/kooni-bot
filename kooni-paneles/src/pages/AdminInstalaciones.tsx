import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Instalacion, Uso } from "../lib/types";

export default function AdminInstalaciones() {
  const [rows, setRows] = useState<Instalacion[]>([]);
  const [uso, setUso] = useState<Map<string, Uso>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [inst, usos] = await Promise.all([
        insforge.database.from("instalaciones").select("*").order("last_seen", { ascending: false }).limit(500),
        insforge.database.from("uso_instalaciones").select("instalacion_id, fecha, conteos, costos").order("fecha", { ascending: false }).limit(1000),
      ]);
      const latest = new Map<string, Uso>();
      for (const u of (usos.data ?? []) as Uso[]) if (!latest.has(u.instalacion_id)) latest.set(u.instalacion_id, u);
      setRows((inst.data ?? []) as Instalacion[]);
      setUso(latest);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Instalaciones</h1>
        <p className="text-sm text-muted">Bots desplegados y sus últimas métricas agregadas (sin datos personales).</p>
      </div>
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Bot</th>
              <th>UID</th>
              <th>Plan</th>
              <th>Mensajes 30d</th>
              <th>IA 30d</th>
              <th>Último visto</th>
              <th>Worker</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-muted">Cargando…</td>
              </tr>
            )}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-muted">Todavía no hay instalaciones registradas.</td>
              </tr>
            )}
            {rows.map((i) => {
              const u = uso.get(i.id);
              const active = i.last_seen && Date.now() - new Date(i.last_seen).getTime() < 7 * 86400000;
              return (
                <tr key={i.id}>
                  <td>
                    <div className="font-medium">{i.bot_name ?? i.slug ?? "—"}</div>
                    <div className="text-[11px] text-muted">{i.slug}</div>
                  </td>
                  <td className="font-mono text-[11px] text-muted">{i.uid}</td>
                  <td>
                    <span className={`chip ${i.tier === "pro" ? "bg-accentSoft text-accent" : "bg-panel2 text-muted"}`}>{i.tier ?? "free"}</span>
                  </td>
                  <td className="font-mono">{u?.conteos?.mensajes30?.toLocaleString("es") ?? "—"}</td>
                  <td className="font-mono">{u?.costos?.ia30 != null ? `$${Number(u.costos.ia30).toFixed(2)}` : "—"}</td>
                  <td>
                    <span className={active ? "text-ok" : "text-muted"}>{i.last_seen ? new Date(i.last_seen).toLocaleDateString("es") : "—"}</span>
                  </td>
                  <td>
                    {i.worker_url ? (
                      <a className="text-accent hover:underline" href={i.worker_url} target="_blank" rel="noreferrer">
                        abrir
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
