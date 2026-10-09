import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { parseResourceLibrary, findResource, resourceMediaOf, type ResourceMediaOpts } from "../resources/library";

/**
 * Media opcional para un mensaje de seguimiento: el dueño elige en Extras un
 * recurso de la Galería (por nombre) y el seguimiento se envía con esa
 * imagen/video/nota de voz/PDF. Acepta varias claves y devuelve la PRIMERA con
 * recurso válido (permite un recurso por mensaje + fallback a las claves viejas).
 */
export async function followupMedia(env: Env, ...settingKeys: string[]): Promise<ResourceMediaOpts> {
  try {
    const repo = new SettingsRepo(new Db(env.DB));
    const lib = parseResourceLibrary(await repo.get(SETTING_KEYS.resourceLibrary));
    for (const key of settingKeys) {
      const name = (await repo.get(key))?.trim();
      if (!name) continue;
      const r = findResource(lib, name);
      if (r) return resourceMediaOf(r);
    }
    return {};
  } catch {
    return {};
  }
}
