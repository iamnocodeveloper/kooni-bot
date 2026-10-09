import type { Env } from "../env";

/**
 * Enlaces públicos firmados para servir los recursos multimedia subidos
 * (imágenes/audios/PDF de la biblioteca) SIN exponer el panel. El token es
 * `id.hmac`: el canal (WAHA/Telegram) busca la URL y recibe los bytes en
 * `GET /media/:token`. Se firma con QUOTE_URL_SECRET (o DASHBOARD_PASSWORD si
 * aquel no está) — mismo patrón que src/quotes/link.ts.
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

export async function signMediaToken(env: Env, id: string): Promise<string> {
  const sig = (await hmacHex(secretOf(env), id)).slice(0, 24);
  return `${id}.${sig}`;
}

/** Devuelve el id si la firma es válida, o null. */
export async function verifyMediaToken(env: Env, token: string): Promise<string | null> {
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

/** URL pública firmada de un recurso subido (para adjuntar en un mensaje). */
export async function mediaUrl(env: Env, id: string): Promise<string> {
  const base = (env.DASHBOARD_BASE_URL || "").replace(/\/+$/, "");
  return `${base}/media/${await signMediaToken(env, id)}`;
}
