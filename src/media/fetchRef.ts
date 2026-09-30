import type { Env } from "../env";
import { stripRef } from "../channels/mediaRef";
import { TELEGRAM_TOKEN_MASK, unmaskTelegramToken } from "../telegramFiles";
import { resolveTelegramToken } from "../channels/telegramCredentials";
import { resolveWahaConfig } from "../channels/wahaCredentials";

export interface FetchedMedia {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Descarga la media referenciada por un marcador `[IMAGE_URL: ...]`/`[AUDIO_URL: ...]`
 * con las credenciales del canal. Es lo que faltaba para que el bot "vea" y
 * "escuche": WAHA exige su `X-Api-Key` y Telegram lleva el token en la URL
 * (enmascarado). El panel ya usaba este mismo criterio en `src/admin/media.ts`;
 * ahora el agente también.
 */
export async function fetchMediaBytes(ref: string, env: Env): Promise<FetchedMedia> {
  const isWaha = ref.startsWith("waha:");
  const stored = stripRef(ref);

  const token = stored.includes(TELEGRAM_TOKEN_MASK)
    ? await resolveTelegramToken(env)
    : undefined;
  const url = unmaskTelegramToken(stored, token);

  const headers: Record<string, string> = {};
  if (isWaha) {
    const cfg = await resolveWahaConfig(env);
    if (cfg.apiKey) headers["X-Api-Key"] = cfg.apiKey;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`media fetch failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    bytes,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}
