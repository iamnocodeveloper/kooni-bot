import { LANG_META, useI18n, type Lang } from "../lib/i18n";

/** Desplegable de bandera para cambiar el idioma del panel (es ↔ en). */
export default function LanguageSelect({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      className={`input py-1 text-xs ${className}`}
      value={lang}
      aria-label={t("lang.label")}
      onChange={(e) => void setLang(e.target.value as Lang)}
    >
      {(["es", "en"] as const).map((l) => (
        <option key={l} value={l}>
          {LANG_META[l].flag} {LANG_META[l].label}
        </option>
      ))}
    </select>
  );
}
