import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { Instalacion } from "../lib/types";

export default function Vinculacion() {
  const { profile } = useAuth();
  const { t, formatDate } = useI18n();
  const [insts, setInsts] = useState<Instalacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await insforge.database
        .from("instalaciones")
        .select("id, user_id, uid, slug, worker_url, bot_name, tier, last_seen, created_at")
        .order("last_seen", { ascending: false })
        .limit(50);
      setInsts((data ?? []) as Instalacion[]);
      setLoading(false);
    })();
  }, []);

  const email = profile?.email ?? "tu@correo.com";
  const prompt = t("vin.prompt", { email });

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloqueado */
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("vin.title")}</h1>
        <p className="text-sm text-muted">{t("vin.subtitle")}</p>
      </div>

      <div className="card p-5">
        <div className="text-sm">
          <span className="text-muted">{t("vin.account")}</span>
          <span className="font-mono">{email}</span>
        </div>
        <div className="mt-3 text-sm text-muted">
          {t("vin.notAutoPre")}<b className="text-cream">{t("vin.notAutoBold")}</b>{t("vin.notAutoPost")}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{t("vin.linkTitle")}</div>
            <p className="text-sm text-muted">{t("vin.linkDesc")}</p>
          </div>
          <button className="btn-ghost shrink-0 text-xs" onClick={copy}>
            {copied ? t("common.copied") : t("vin.copyPrompt")}
          </button>
        </div>
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-line bg-panel2 p-3 font-mono text-[11.5px] leading-relaxed text-muted">
          {prompt}
        </pre>
        <p className="mt-2 text-[11.5px] text-muted">
          {t("vin.manualPre")}<code className="text-accent">npx kooni-bot pair</code>
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("vin.col.bot")}</th>
              <th>{t("vin.col.uid")}</th>
              <th>{t("vin.col.plan")}</th>
              <th>{t("vin.col.seen")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-muted">{t("common.loading")}</td>
              </tr>
            )}
            {!loading && insts.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted">{t("vin.empty")}</td>
              </tr>
            )}
            {insts.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="font-medium">{i.bot_name ?? i.slug ?? "—"}</div>
                  <div className="text-[11px] text-muted">{i.slug}</div>
                </td>
                <td className="font-mono text-[11px] text-muted">{i.uid}</td>
                <td>
                  <span className={`chip ${i.tier === "pro" ? "bg-accentSoft text-accent" : "bg-panel2 text-muted"}`}>{i.tier ?? "free"}</span>
                </td>
                <td className="text-muted">{i.last_seen ? formatDate(i.last_seen) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
