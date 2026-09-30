import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone ?? "text-cream"}`}>{value}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const { t, formatNumber } = useI18n();
  const [k, setK] = useState({ clientes: 0, pro: 0, free: 0, instalaciones: 0, activas: 0, mensajes30: 0, costo30: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [lic, inst, prof, uso] = await Promise.all([
        insforge.database.from("licencias").select("id, plan, estado").limit(1000),
        insforge.database.from("instalaciones").select("id, last_seen").limit(1000),
        insforge.database.from("profiles").select("id, role").limit(1000),
        insforge.database.from("uso_instalaciones").select("instalacion_id, fecha, conteos, costos").order("fecha", { ascending: false }).limit(1000),
      ]);

      const licRows = (lic.data ?? []) as any[];
      const instRows = (inst.data ?? []) as any[];
      const profRows = (prof.data ?? []) as any[];
      const usoRows = (uso.data ?? []) as any[];

      const pro = licRows.filter((l) => l.plan === "pro" && l.estado !== "revocada").length;
      const weekAgo = Date.now() - 7 * 86400000;
      const activas = instRows.filter((i) => i.last_seen && new Date(i.last_seen).getTime() > weekAgo).length;

      const latest = new Map<string, any>();
      for (const u of usoRows) if (!latest.has(u.instalacion_id)) latest.set(u.instalacion_id, u);
      let mensajes30 = 0;
      let costo30 = 0;
      for (const u of latest.values()) {
        mensajes30 += Number(u.conteos?.mensajes30 ?? 0);
        costo30 += Number(u.costos?.ia30 ?? 0);
      }

      setK({
        clientes: profRows.filter((p) => p.role !== "admin").length,
        pro,
        free: licRows.length - pro,
        instalaciones: instRows.length,
        activas,
        mensajes30,
        costo30,
      });
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("admin.dashboard.title")}</h1>
        <p className="text-sm text-muted">{t("admin.dashboard.subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t("admin.dashboard.kpiClientes")} value={loading ? "…" : k.clientes} />
        <Kpi label={t("admin.dashboard.kpiPro")} value={loading ? "…" : k.pro} tone="text-accent" />
        <Kpi label={t("admin.dashboard.kpiFree")} value={loading ? "…" : k.free} />
        <Kpi label={t("admin.dashboard.kpiInstalaciones")} value={loading ? "…" : k.instalaciones} />
        <Kpi label={t("admin.dashboard.kpiActivas")} value={loading ? "…" : k.activas} tone="text-ok" />
        <Kpi label={t("admin.dashboard.kpiMensajes")} value={loading ? "…" : formatNumber(k.mensajes30)} />
        <Kpi label={t("admin.dashboard.kpiCosto")} value={loading ? "…" : `$${k.costo30.toFixed(2)}`} />
      </div>
    </div>
  );
}
