import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";
import type { Instalacion, Licencia, Uso } from "../lib/types";

const WEEK_MS = 7 * 86400000;

function Step({ cmd, note }: { cmd: string; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-accent">❯</span>
        <code className="rounded bg-panel2 px-2 py-1 font-mono text-[12.5px] text-accent">{cmd}</code>
      </div>
      <div className="pl-5 text-[11.5px] text-muted"># {note}</div>
    </div>
  );
}

function BotCard({ inst, uso }: { inst: Instalacion; uso?: Uso }) {
  const { t, formatDate, formatNumber } = useI18n();
  const active = inst.last_seen && Date.now() - new Date(inst.last_seen).getTime() < WEEK_MS;
  const pro = inst.tier === "pro";
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{inst.bot_name ?? inst.slug ?? "Bot"}</div>
          <div className="font-mono text-[11px] text-muted">{inst.uid ?? "—"}</div>
        </div>
        <span className={`chip ${active ? "bg-ok/15 text-ok" : "bg-panel2 text-muted"}`}>
          {active ? t("cuenta.active") : t("cuenta.offline")}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-line bg-panel2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted">{t("cuenta.kpi.messages")}</div>
          <div className="font-mono text-sm">{uso?.conteos?.mensajes30 != null ? formatNumber(uso.conteos.mensajes30) : "—"}</div>
        </div>
        <div className="rounded-lg border border-line bg-panel2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted">{t("cuenta.kpi.leads")}</div>
          <div className="font-mono text-sm">{uso?.conteos?.leads30 != null ? formatNumber(uso.conteos.leads30) : "—"}</div>
        </div>
        <div className="rounded-lg border border-line bg-panel2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted">{t("cuenta.kpi.ai")}</div>
          <div className="font-mono text-sm">{uso?.costos?.ia30 != null ? `$${Number(uso.costos.ia30).toFixed(2)}` : "—"}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className={`chip ${pro ? "bg-accentSoft text-accent" : "bg-panel2 text-muted"}`}>{inst.tier ?? "free"}</span>
        <span className="text-[11px] text-muted">{inst.last_seen ? t("cuenta.seen", { date: formatDate(inst.last_seen) }) : "—"}</span>
        {inst.worker_url ? (
          <a className="btn-ghost py-1 text-xs" href={`${inst.worker_url}/admin`} target="_blank" rel="noreferrer">
            {t("cuenta.openPanel")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function Cuenta() {
  const { t, formatDate } = useI18n();
  const [lics, setLics] = useState<Licencia[]>([]);
  const [insts, setInsts] = useState<Instalacion[]>([]);
  const [uso, setUso] = useState<Map<string, Uso>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [lic, inst, usos] = await Promise.all([
        insforge.database.from("licencias").select("id, plan, kind, expiry, estado, modules, bot_slug, inst_uid").order("created_at", { ascending: false }).limit(50),
        insforge.database.from("instalaciones").select("id, user_id, uid, slug, worker_url, bot_name, tier, last_seen, created_at").order("last_seen", { ascending: false }).limit(50),
        insforge.database.from("uso_instalaciones").select("id, instalacion_id, fecha, conteos, costos").order("fecha", { ascending: false }).limit(200),
      ]);
      setLics((lic.data ?? []) as Licencia[]);
      setInsts((inst.data ?? []) as Instalacion[]);
      const latest = new Map<string, Uso>();
      for (const u of (usos.data ?? []) as Uso[]) if (!latest.has(u.instalacion_id)) latest.set(u.instalacion_id, u);
      setUso(latest);
      setLoading(false);
    })();
  }, []);

  const pro = lics.find((l) => l.plan === "pro" && l.estado !== "revocada");
  const hasBots = insts.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("cuenta.title")}</h1>
        <p className="text-sm text-muted">{t("cuenta.subtitle")}</p>
      </div>

      <div className="card p-5">
        {loading ? (
          <div className="text-muted">{t("common.loading")}</div>
        ) : pro ? (
          <div className="flex items-center gap-3">
            <span className="chip bg-accentSoft text-accent">{t("cuenta.proChip")}</span>
            <span className="text-sm text-muted">
              {pro.expiry ? t("cuenta.expires", { date: formatDate(pro.expiry) }) : t("common.lifetime")} · {t("cuenta.modulesActive", { n: pro.modules?.length ?? 0 })}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="chip bg-panel2 text-muted">{t("cuenta.freeChip")}</span>
            <span className="text-sm text-muted">{t("cuenta.freeDesc")}</span>
          </div>
        )}
      </div>

      {loading ? null : hasBots ? (
        <div className="grid gap-4 md:grid-cols-2">
          {insts.map((i) => (
            <BotCard key={i.id} inst={i} uso={uso.get(i.id)} />
          ))}
        </div>
      ) : (
        <div className="card flex flex-col gap-4 p-6">
          <div>
            <div className="font-semibold">{t("cuenta.noBots")}</div>
            <p className="text-sm text-muted">{t("cuenta.noBotsDesc")}</p>
          </div>
          <Step cmd="npx kooni-bot init" note={t("cuenta.step1note")} />
          <Step cmd="npx kooni-bot login" note={t("cuenta.step2note")} />
          <p className="text-[12.5px] text-muted">{t("cuenta.step3desc")}</p>
        </div>
      )}

      {!loading && !pro && (
        <div className="card p-5">
          <div className="font-semibold">{t("cuenta.kooniPlusTitle")}</div>
          <p className="mt-1 text-sm text-muted">{t("cuenta.kooniPlusDesc")}</p>
        </div>
      )}
    </div>
  );
}
