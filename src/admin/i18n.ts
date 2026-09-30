import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { es } from "./locales/es";
import { en } from "./locales/en";

/**
 * i18n del panel del bot (SSR, sin React). El idioma vive en `settings`
 * (`panel_language`, por instalación) y el español es el default.
 *
 * Uso en una vista:
 *   const { t } = await panelI18n(env);
 *   ... t("nav.scraping") ...
 *
 * Las claves no traducidas devuelven la clave tal cual, así que las vistas que
 * todavía no pasan por `t()` siguen mostrando su texto en español original —
 * sin fugas ni textos raros.
 */
export type Lang = "es" | "en";

export const DICTS: Record<Lang, Record<string, string>> = { es, en };
export type MessageKey = keyof typeof es;
const STORAGE_TTL_MS = 60_000;
let cache: { at: number; lang: Lang } | null = null;

/** Invalida la cache (al cambiar el idioma desde el panel). */
export function clearPanelLangCache(): void {
  cache = null;
}

export async function panelLang(env?: Env): Promise<Lang> {
  if (!env) return "es";
  if (cache && Date.now() - cache.at < STORAGE_TTL_MS) return cache.lang;
  let lang: Lang = "es";
  try {
    const v = await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.panelLanguage);
    if (v === "en") lang = "en";
  } catch {
    /* sin DB → default es */
  }
  cache = { at: Date.now(), lang };
  return lang;
}

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

function interpolate(msg: string, vars?: Record<string, string | number>): string {
  if (!vars) return msg;
  let out = msg;
  for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return out;
}

export function makeT(lang: Lang): T {
  return (key, vars) => interpolate(DICTS[lang][key] ?? es[key] ?? String(key), vars);
}

/** Atajo: `{ lang, t }` listos para la vista. */
export async function panelI18n(env?: Env): Promise<{ lang: Lang; t: T }> {
  const lang = await panelLang(env);
  return { lang, t: makeT(lang) };
}
