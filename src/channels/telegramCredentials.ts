import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";

/**
 * Token efectivo del bot de Telegram. El panel guarda el token en D1 (settings)
 * para conectar el canal sin `wrangler secret put` ni redeploy; si no hay nada
 * en settings, se usa el secret de env (bots viejos).
 */
export async function resolveTelegramToken(env: Env): Promise<string | undefined> {
  try {
    const token = await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.telegramBotToken);
    if (token && token.trim() !== "") return token.trim();
  } catch {
    // sin settings disponible → env
  }
  return env.TELEGRAM_BOT_TOKEN;
}
