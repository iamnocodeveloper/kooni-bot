import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import type { DemoMensaje } from "../lib/demos";

// Ritmos del guion animado. Nada de esto es una respuesta de red: son timers.
const MS_ANTES_DE_ESCRIBIR = 420;
const MS_ESCRIBIENDO = 1100;
const MS_CLIENTE = 750;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg";

/**
 * Demo SIMULADO: un celular falso que anima un guion fijo, burbuja por burbuja,
 * con "escribiendo…" en las respuestas del bot y botón para reiniciar.
 *
 * Sin backend, sin fetch, sin WhatsApp, sin costos: todo es estado de React.
 * El guion llega ya traducido (ver `src/lib/demos/*.ts`).
 */
export default function DemoChat({ guion, titulo }: { guion: DemoMensaje[]; titulo: string }) {
  const { t } = useI18n();
  const [visibles, setVisibles] = useState(0);
  const [escribiendo, setEscribiendo] = useState(false);
  const [sinAnimacion, setSinAnimacion] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Accesibilidad: si el sistema pide menos movimiento, el guion aparece entero.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setSinAnimacion(mq.matches);
    aplicar();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", aplicar);
      return () => mq.removeEventListener("change", aplicar);
    }
    return;
  }, []);

  // Al cambiar de giro o de idioma, el guion es otro arreglo: se reinicia solo.
  useEffect(() => {
    setVisibles(0);
    setEscribiendo(false);
  }, [guion]);

  // Avance automático: un mensaje a la vez, con la pausa de "escribiendo…".
  useEffect(() => {
    if (sinAnimacion) {
      setVisibles(guion.length);
      setEscribiendo(false);
      return;
    }
    if (visibles >= guion.length) {
      if (escribiendo) setEscribiendo(false);
      return;
    }
    const siguiente = guion[visibles];
    if (siguiente.de === "bot" && !escribiendo) {
      const id = window.setTimeout(() => setEscribiendo(true), MS_ANTES_DE_ESCRIBIR);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(
      () => {
        setVisibles((n) => n + 1);
        setEscribiendo(false);
      },
      siguiente.de === "bot" ? MS_ESCRIBIENDO : MS_CLIENTE,
    );
    return () => window.clearTimeout(id);
  }, [guion, visibles, escribiendo, sinAnimacion]);

  // Deja la última burbuja a la vista dentro del celular (no mueve la página).
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibles, escribiendo]);

  function reiniciar() {
    setVisibles(0);
    setEscribiendo(false);
  }

  return (
    <div className="mx-auto w-full max-w-[380px]">
      {/* Marco del celular */}
      <div
        role="group"
        aria-label={t("lp.demo.aria.phone")}
        className="rounded-[2.25rem] border border-brand-linelit bg-brand-panel p-2 shadow-[0_20px_60px_-20px_rgba(224,95,216,0.35)]"
      >
        {/* Cabecera del chat */}
        <div className="flex items-center gap-3 rounded-t-[1.75rem] border-b border-brand-line bg-brand-panel2 px-3 py-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-accent to-brand-accent2 font-display text-sm font-bold text-brand-onaccent"
          >
            K
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[13px] font-semibold text-brand-cream">{titulo}</p>
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-brand-ok">
              <span aria-hidden="true">●</span>
              {t("lp.demo.online")}
            </p>
          </div>
        </div>

        {/* Conversación */}
        <div
          ref={logRef}
          role="log"
          aria-label={t("lp.demo.aria.log")}
          className="flex h-[360px] flex-col gap-2 overflow-y-auto bg-brand-bg px-3 py-3 sm:h-[420px]"
        >
          {guion.slice(0, visibles).map((m, i) => {
            const esBot = m.de === "bot";
            return (
              <div key={`${i}-${m.de}`} className={esBot ? "flex justify-end" : "flex justify-start"}>
                <p
                  className={[
                    "max-w-[86%] whitespace-pre-line rounded-2xl px-3 py-2 font-display text-[13px] leading-snug",
                    esBot
                      ? "rounded-br-md border border-brand-accent/40 bg-brand-accent/15 text-brand-cream"
                      : "rounded-bl-md border border-brand-line bg-brand-panel2 text-brand-cream/90",
                  ].join(" ")}
                >
                  <span className="sr-only">{esBot ? t("lp.demo.from.bot") : t("lp.demo.from.client")} </span>
                  {m.texto}
                </p>
              </div>
            );
          })}

          {escribiendo && (
            <div className="flex justify-end">
              <p className="flex items-center gap-1.5 rounded-2xl rounded-br-md border border-brand-accent/40 bg-brand-accent/10 px-3 py-2.5">
                <span className="sr-only">{t("lp.demo.typing")}</span>
                <span aria-hidden="true" className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-accent [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-accent [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-accent" />
                </span>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={reiniciar}
          aria-label={t("lp.demo.aria.replay")}
          className={`inline-flex items-center gap-2 rounded-lg border border-brand-line bg-brand-panel px-3 py-1.5 text-xs font-semibold text-brand-cream transition hover:border-brand-accent/60 hover:text-brand-accent ${FOCUS}`}
        >
          <span aria-hidden="true">↺</span>
          {t("lp.demo.replay")}
        </button>
      </div>

      <p className="mt-3 rounded-xl border border-brand-line bg-brand-panel/70 px-3 py-2 text-center text-[12px] leading-relaxed text-brand-muted">
        {t("lp.demo.disclaimer")}
      </p>
    </div>
  );
}
