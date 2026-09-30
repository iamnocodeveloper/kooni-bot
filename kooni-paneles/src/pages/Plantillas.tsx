import { useState } from "react";
import { useI18n } from "../lib/i18n";
// Los giros viven en `lib/giros.ts` (fuente única): el mismo listado lo usa la
// landing pública (/giros). Acá solo cambia la presentación.
import { GIROS, giroDescKey, giroNameKey, installCommand } from "../lib/giros";

export default function Plantillas() {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);

  async function copiar(id: string) {
    try {
      await navigator.clipboard.writeText(installCommand(id));
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard bloqueado */
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("pla.title")}</h1>
        <p className="text-sm text-muted">{t("pla.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {GIROS.map((g) => {
          const cmd = installCommand(g.id);
          return (
            <div key={g.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{g.emoji}</span>
                <div>
                  <div className="font-semibold">{t(giroNameKey(g.id))}</div>
                  <p className="mt-0.5 text-sm text-muted">{t(giroDescKey(g.id))}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <code className="truncate rounded bg-panel2 px-2 py-1 font-mono text-[11.5px] text-accent">{cmd}</code>
                <button className="btn-ghost shrink-0 py-1 text-xs" onClick={() => copiar(g.id)}>
                  {copied === g.id ? t("common.copied") : t("common.copy")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[12px] text-muted">
        {t("pla.footerPre")}<span className="font-mono text-accent">/re-nichar</span>{t("pla.footerPost")}
      </p>
    </div>
  );
}
