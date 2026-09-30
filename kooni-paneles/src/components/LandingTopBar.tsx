import { Link } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import LanguageSelect from "./LanguageSelect";

/**
 * Barra superior de la landing pública: marca a la izquierda, selector de
 * idioma a la derecha.
 *
 * El selector es el MISMO del hub (`LanguageSelect`), así el idioma elegido en
 * la landing es el mismo estado de i18n que ve el panel. Los colores del hub
 * (`.input` vive después de las utilidades en index.css) se pisan con `!` para
 * que la landing use su paleta de marca sin repintar el hub.
 */
export default function LandingTopBar() {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-20 border-b border-brand-line bg-brand-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link
          to="/giros"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
        >
          <span aria-hidden="true" className="relative grid h-8 w-8 place-items-center rounded-lg border border-brand-accent bg-brand-bg font-display text-sm font-bold text-brand-accent">
            K
            <span className="absolute right-[3px] top-[3px] h-1.5 w-1.5 rounded-full bg-brand-accent2" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-display text-sm font-semibold text-brand-cream">Kooni</span>
            <span className="hidden text-[11px] text-brand-muted sm:block">{t("lp.brand.tagline")}</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to="/giros"
            className="hidden rounded-lg font-mono text-[11px] uppercase tracking-wider text-brand-muted transition hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg sm:inline-block"
          >
            {t("lp.nav.all")}
          </Link>
          <LanguageSelect className="!w-auto !border-brand-line !bg-brand-panel !py-1 !text-xs !text-brand-cream focus:!border-brand-accent" />
        </div>
      </div>
    </header>
  );
}
