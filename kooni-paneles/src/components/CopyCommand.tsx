import { useState } from "react";
import { useI18n } from "../lib/i18n";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg";

/**
 * Bloque copiable: el comando en mono + botón "Copiar" con feedback.
 * Puro cliente (`navigator.clipboard`): sin red, sin dependencias.
 */
export default function CopyCommand({ comando, className = "" }: { comando: string; className?: string }) {
  const { t } = useI18n();
  const [estado, setEstado] = useState<"idle" | "ok" | "error">("idle");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(comando);
      setEstado("ok");
      window.setTimeout(() => setEstado("idle"), 2000);
    } catch {
      // Clipboard bloqueado (sin HTTPS, permiso denegado): se dice y se sigue.
      setEstado("error");
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <code className="min-w-0 flex-1 break-words rounded-lg border border-brand-line bg-brand-panel2 px-3 py-2 font-mono text-[12.5px] text-brand-accent">
        {comando}
      </code>
      <button
        type="button"
        onClick={() => void copiar()}
        aria-label={`${t("lp.copy.cmd")}: ${comando}`}
        className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-brand-accent/50 bg-brand-accent/10 px-3 py-2 text-xs font-semibold text-brand-accent transition hover:bg-brand-accent/20 ${FOCUS}`}
      >
        <span aria-hidden="true">{estado === "ok" ? "✓" : "⧉"}</span>
        <span aria-live="polite">{estado === "ok" ? t("lp.copy.done") : t("lp.copy.cmd")}</span>
      </button>
      {estado === "error" && (
        <p role="alert" className="w-full text-[11px] text-brand-warn">
          {t("lp.copy.error")}
        </p>
      )}
    </div>
  );
}
