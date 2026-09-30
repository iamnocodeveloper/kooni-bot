import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { GIROS, giroDescKey, giroNameKey, installCommand } from "../lib/giros";
import CopyCommand from "../components/CopyCommand";
import LandingTopBar from "../components/LandingTopBar";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg";

/** /giros — grilla pública de los 8 giros (marca Kooni, sin auth). */
export default function GirosPublico() {
  const { t } = useI18n();
  const titulo = `Kooni · ${t("lp.grid.title")}`;

  useEffect(() => {
    document.title = titulo;
    return () => {
      document.title = "Kooni";
    };
  }, [titulo]);

  return (
    <div className="min-h-screen bg-brand-bg font-display text-brand-cream">
      <LandingTopBar />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-accent2">
          {t("lp.brand.tagline")}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {t("lp.grid.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-brand-muted sm:text-base">
          {t("lp.grid.subtitle")}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {GIROS.map((g) => (
            <div
              key={g.id}
              className="flex flex-col gap-4 rounded-2xl border border-brand-line bg-brand-panel p-5 transition hover:border-brand-accent/50"
            >
              <Link to={`/giros/${g.id}`} className={`flex items-start gap-3 rounded-lg ${FOCUS}`}>
                <span aria-hidden="true" className="text-3xl">
                  {g.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg font-semibold text-brand-cream">
                    {t(giroNameKey(g.id))}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-brand-muted">
                    {t(giroDescKey(g.id))}
                  </span>
                </span>
              </Link>

              <div className="mt-auto">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-brand-muted">
                  {t("lp.grid.installLabel")}
                </p>
                <CopyCommand comando={installCommand(g.id)} />
                <Link
                  to={`/giros/${g.id}`}
                  className={`mt-3 inline-flex items-center gap-1 rounded-lg font-mono text-[12px] font-semibold text-brand-accent transition hover:text-brand-accent2 ${FOCUS}`}
                >
                  {t("lp.grid.viewDemo")} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 border-t border-brand-line pt-6 text-[12px] leading-relaxed text-brand-muted">
          {t("lp.footer.note")}
        </p>
      </main>
    </div>
  );
}
