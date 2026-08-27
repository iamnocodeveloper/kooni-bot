import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";

/**
 * Credenciales efectivas de Zernio. El panel guarda la API key / webhook secret
 * en D1 (`settings`) para conectar el canal sin `wrangler secret put` ni
 * redeploy; si no hay nada en settings, se usa el secret de env (bots viejos).
 */
export interface ZernioCredentials {
  apiKey: string | undefined;
  webhookSecret: string | undefined;
}

/** Extrae las credenciales de un snapshot de settings (overlay). */
export function zernioOverridesFrom(settings: Record<string, string>): ZernioCredentials {
  const pick = (key: string): string | undefined => {
    const v = settings[key];
    return v !== undefined && v.trim() !== "" ? v.trim() : undefined;
  };
  return {
    apiKey: pick(SETTING_KEYS.zernioApiKey),
    webhookSecret: pick(SETTING_KEYS.zernioWebhookSecret),
  };
}

/**
 * Resuelve las credenciales efectivas: settings de D1 gana; si está vacío/ausente,
 * cae al env. Nunca truena: sin DB disponible devuelve solo el env.
 */
export async function resolveZernioCredentials(env: Env): Promise<ZernioCredentials> {
  try {
    const settings = await new SettingsRepo(new Db(env.DB)).all();
    const overrides = zernioOverridesFrom(settings);
    return {
      apiKey: overrides.apiKey ?? env.ZERNIO_API_KEY,
      webhookSecret: overrides.webhookSecret ?? env.ZERNIO_WEBHOOK_SECRET,
    };
  } catch {
    return { apiKey: env.ZERNIO_API_KEY, webhookSecret: env.ZERNIO_WEBHOOK_SECRET };
  }
}
