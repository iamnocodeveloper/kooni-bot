import { useEffect, useMemo, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n, type MessageKey } from "../lib/i18n";
import type { Novedad } from "../lib/types";

const TIPO: Record<string, { key: MessageKey; cls: string }> = {
  nuevo: { key: "nov.type.nuevo", cls: "bg-accentSoft text-accent" },
  mejora: { key: "nov.type.mejora", cls: "bg-warn/15 text-warn" },
  arreglo: { key: "nov.type.arreglo", cls: "bg-bad/15 text-bad" },
};

export default function Novedades() {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState<Novedad[]>([]);
  const [filtro, setFiltro] = useState<"todas" | "kooni" | "kooni+">("todas");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await insforge.database
        .from("novedades")
        .select("*")
        .eq("visible", true)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      setItems((data ?? []) as Novedad[]);
      setLoading(false);
    })();
  }, []);

  const list = useMemo(
    () => (filtro === "todas" ? items : items.filter((i) => i.origen === filtro)),
    [items, filtro],
  );

  const filterLabel: Record<"todas" | "kooni" | "kooni+", string> = {
    todas: t("nov.filter.all"),
    kooni: "Kooni",
    "kooni+": "Kooni+",
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("nov.title")}</h1>
        <p className="text-sm text-muted">
          {t("nov.subtitlePre")}<code className="mx-1 text-accent">npx kooni-bot update</code>{t("nov.subtitlePost")}
        </p>
      </div>

      <div className="flex gap-2">
        {(["todas", "kooni", "kooni+"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`chip ${filtro === f ? "bg-accentSoft text-accent" : "bg-panel2 text-muted"}`}
          >
            {filterLabel[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted">{t("common.loading")}</div>
      ) : list.length === 0 ? (
        <div className="card p-6 text-sm text-muted">{t("nov.empty")}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((n) => {
            const tipo = TIPO[n.tipo] ?? TIPO.nuevo;
            return (
              <div key={n.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="font-mono">
                    {formatDate(n.fecha + "T00:00:00", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  {n.version ? <span className="font-mono">· {n.version}</span> : null}
                  <span className={`chip ${tipo.cls}`}>{t(tipo.key)}</span>
                  {n.origen === "kooni+" ? <span className="chip bg-panel2 text-muted">Kooni+</span> : null}
                </div>
                <div className="mt-2 font-semibold">{n.titulo}</div>
                {n.cuerpo ? <p className="mt-1 text-sm text-muted">{n.cuerpo}</p> : null}
                {n.update_hint ? (
                  <div className="mt-2 font-mono text-[11.5px] text-muted">{n.update_hint}</div>
                ) : null}
                {n.cta_label && n.cta_url ? (
                  <a className="mt-3 inline-block text-sm text-accent hover:underline" href={n.cta_url} target="_blank" rel="noreferrer">
                    {n.cta_label} →
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
