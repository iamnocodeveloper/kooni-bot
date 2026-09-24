import { useEffect, useMemo, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Instalacion, Uso } from "../lib/types";

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone ?? "text-cream"}`}>{value}</div>
    </div>
  );
}

export default function AdminEstadisticas() {
  const [insts, setInsts] = useState<Instalacion[]>([]);
  const [uso, setUso] = useState<Map<string, Uso>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [inst, usos] = await Promise.all([
        insforge.database.from("instalaciones").select("id, uid, slug, bot_name, tier, last_seen").order("last_seen", { ascending: false }).limit(1000),
        insforge.database.from("uso_instalaciones").select("instalacion_id, fecha, conteos, costos").order("fecha", { ascending: false }).limit(2000),
      ]);
      const latest = new Map<string, Uso>();
      for (const u of (usos.data ?? []) as Uso[]) if (!latest.has(u.instalacion_id)) latest.set(u.instalacion_id, u);
      setInsts((inst.data ?? []) as Instalacion[]);
      setUso(latest);
      setLoading(false);
    })();
  }, []);

  const agg = useMemo(() => {
    let mensajes = 0;
    let leads = 0;
    let costo = 0;
    let conDatos = 0;
    const rows = insts.map((i) => {
      const u = uso.get(i.id);
      const m = Number(u?.conteos?.mensajes30 ?? 0);
      const l = Number(u?.conteos?.leads30 ?? 0);
      const c = Number(u?.costos?.ia30 ?? 0);
      if (u) conDatos++;
      mensajes += m;
      leads += l;
      costo += c;
      return { inst: i, m, l, c };
    });
    const activos = insts.filter((i) => i.last_seen && Date.now() - new Date(i.last_seen).getTime() < 7 * 86400000).length;
    const salud = insts.length ? Math.round((activos / insts.length) * 100) : 0;
    rows.sort((a, b) => b.m - a.m);
    return { mensajes, leads, costo, conDatos, activos, salud, rows };
  }, [insts, uso]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Estadísticas</h1>
        <p className="text-sm text-muted">Tu operación completa en un solo número: totales, salud y ranking por bot.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Mensajes 30d" value={loading ? "…" : agg.mensajes.toLocaleString("es")} />
        <Kpi label="Leads 30d" value={loading ? "…" : agg.leads.toLocaleString("es")} tone="text-accent" />
        <Kpi label="Costo IA 30d" value={loading ? "…" : `$${agg.costo.toFixed(2)}`} />
        <Kpi label="Salud (activos 7d)" value={loading ? "…" : `${agg.salud}%`} tone="text-ok" />
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Bot</th>
              <th>Plan</th>
              <th>Mensajes 30d</th>
              <th>Leads 30d</th>
              <th>IA 30d</th>
              <th>Último visto</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-muted">Cargando…</td></tr>
            )}
            {!loading && agg.rows.length === 0 && (
              <tr><td colSpan={7} className="text-muted">Sin instalaciones todavía.</td></tr>
            )}
            {agg.rows.map((r, idx) => (
              <tr key={r.inst.id}>
                <td className="text-muted">{idx + 1}</td>
                <td>
                  <div className="font-medium">{r.inst.bot_name ?? r.inst.slug ?? "—"}</div>
                  <div className="font-mono text-[11px] text-muted">{r.inst.uid}</div>
                </td>
                <td>
                  <span className={`chip ${r.inst.tier === "pro" ? "bg-accentSoft text-accent" : "bg-panel2 text-muted"}`}>{r.inst.tier ?? "free"}</span>
                </td>
                <td className="font-mono">{r.m.toLocaleString("es")}</td>
                <td className="font-mono">{r.l.toLocaleString("es")}</td>
                <td className="font-mono">${r.c.toFixed(2)}</td>
                <td className="text-muted">{r.inst.last_seen ? new Date(r.inst.last_seen).toLocaleDateString("es") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] text-muted">
        {loading ? "" : `${agg.conDatos} de ${insts.length} instalaciones reportan uso. El ranking ordena por mensajes de los últimos 30 días.`}
      </p>
    </div>
  );
}
