import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { parseResourceLibrary, findResource, resourceMediaOf, type ResourceMediaOpts } from "../resources/library";

/**
 * Media opcional para un mensaje de seguimiento: el dueño elige en Extras un
 * recurso de la Galería (por nombre) y el seguimiento se envía con esa
 * imagen/nota de voz/PDF. Si no hay o el recurso no existe, devuelve {}.
 */
export async function followupMedia(env: Env, settingKey: string): Promise<ResourceMediaOpts> {
  try {
    const repo = new SettingsRepo(new Db(env.DB));
    const name = (await repo.get(settingKey))?.trim();
    if (!name) return {};
    const lib = parseResourceLibrary(await repo.get(SETTING_KEYS.resourceLibrary));
    const r = findResource(lib, name);
    return r ? resourceMediaOf(r) : {};
  } catch {
    return {};
  }
}
