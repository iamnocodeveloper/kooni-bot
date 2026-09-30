import { useState } from "react";
import { useI18n, type MessageKey } from "../lib/i18n";

// Giros (packs de nicho) que trae Kooni. El que elijas se instala con
// `npx kooni-bot install <giro>` y re-etiqueta el panel del bot.
const GIROS: { id: string; emoji: string }[] = [
  { id: "generico", emoji: "🤖" },
  { id: "agencia-ia", emoji: "🚀" },
  { id: "restaurante", emoji: "🍽️" },
  { id: "inmobiliaria", emoji: "🏠" },
  { id: "clinica", emoji: "🩺" },
  { id: "barberia", emoji: "💈" },
  { id: "cartera", emoji: "💰" },
  { id: "taxis", emoji: "🚕" },
];

export default function Plantillas() {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);

  async function copiar(id: string) {
    try {
      await navigator.clipboard.writeText(`npx kooni-bot install ${id}`);
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
          const cmd = `npx kooni-bot install ${g.id}`;
          return (
            <div key={g.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{g.emoji}</span>
                <div>
                  <div className="font-semibold">{t(`pla.giro.${g.id}.name` as MessageKey)}</div>
                  <p className="mt-0.5 text-sm text-muted">{t(`pla.giro.${g.id}.desc` as MessageKey)}</p>
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
