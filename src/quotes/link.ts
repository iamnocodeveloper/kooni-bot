import type { Env } from "../env";
import type { Quote } from "../db/quotes";

/**
 * Enlaces públicos firmados para servir el PDF de una cotización sin exponer el
 * panel. El token es `quoteId.hmac`: el canal (Telegram/WAHA/Zernio) busca la
 * URL y recibe el PDF generado al vuelo en GET /q/:token. Se firma con
 * QUOTE_URL_SECRET (o DASHBOARD_PASSWORD si aquel no está).
 */

function secretOf(env: Env): string {
  return (env.QUOTE_URL_SECRET || env.DASHBOARD_PASSWORD || "kooni").trim();
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signQuoteToken(env: Env, quoteId: string): Promise<string> {
  const sig = (await hmacHex(secretOf(env), quoteId)).slice(0, 24);
  return `${quoteId}.${sig}`;
}

/** Devuelve el quoteId si la firma es válida, o null. */
export async function verifyQuoteToken(env: Env, token: string): Promise<string | null> {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const id = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = (await hmacHex(secretOf(env), id)).slice(0, 24);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? id : null;
}

/** URL pública del PDF de la cotización (para adjuntar en un mensaje). */
export async function quotePdfUrl(env: Env, quoteId: string): Promise<string> {
  const base = (env.DASHBOARD_BASE_URL || "").replace(/\/+$/, "");
  return `${base}/q/${await signQuoteToken(env, quoteId)}`;
}

/** Nombre amigable del archivo (ej. "Cotizacion-COT-202610-0001.pdf"). */
export function quoteFilename(quote: Pick<Quote, "number" | "id">): string {
  const raw = (quote.number ?? quote.id).replace(/[^\w.-]/g, "");
  return `Cotizacion-${raw}.pdf`;
}
