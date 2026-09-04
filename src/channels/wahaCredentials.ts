import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";

export interface WahaConfig {
  base: string; // sin slash final
  session: string;
  apiKey?: string;
  webhookToken?: string;
}

/**
 * Config efectiva de WAHA. El panel (Conexiones → WAHA) guarda URL del
 * servidor, sesión, API key y webhook token en D1 (settings) para conectar el
 * canal SIN `wrangler secret put` ni redeploy — mismo patrón que
 * `resolveTelegramToken`/Zernio. Si no hay nada en settings, cae a las
 * vars/secrets de env (`WAHA_API_URL`, `WAHA_SESSION`, `WAHA_API_KEY`,
 * `WAHA_WEBHOOK_TOKEN` en `env.ts`, para setup manual o instalaciones viejas).
 */
export async function resolveWahaConfig(env: Env): Promise<WahaConfig> {
  let base = env.WAHA_API_URL?.trim() || "";
  let session = env.WAHA_SESSION?.trim() || "default";
  let apiKey = env.WAHA_API_KEY?.trim() || undefined;
  let webhookToken = env.WAHA_WEBHOOK_TOKEN?.trim() || undefined;

  try {
    const repo = new SettingsRepo(new Db(env.DB));
    const [sBase, sSession, sKey, sToken] = await Promise.all([
      repo.get(SETTING_KEYS.wahaApiUrl),
      repo.get(SETTING_KEYS.wahaSession),
      repo.get(SETTING_KEYS.wahaApiKey),
      repo.get(SETTING_KEYS.wahaWebhookToken),
    ]);
    if (sBase && sBase.trim() !== "") base = sBase.trim();
    if (sSession && sSession.trim() !== "") session = sSession.trim();
    if (sKey && sKey.trim() !== "") apiKey = sKey.trim();
    if (sToken && sToken.trim() !== "") webhookToken = sToken.trim();
  } catch {
    // sin settings disponible (o sin DB, ej. en tests) → env
  }

  return { base: base.replace(/\/+$/, ""), session, apiKey, webhookToken };
}
