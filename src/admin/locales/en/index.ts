import { es as esMerged } from "../es";
import { en as coreEn } from "./core";
import { inboxEn } from "./inbox";
import { configEn } from "./config";
import { analisisEn } from "./analisis";
import { agenteEn } from "./agente";
import { restoEn } from "./resto";

/** El EN debe cubrir TODAS las claves del ES (lo garantiza el tipo). */
export const en: Record<keyof typeof esMerged, string> = {
  ...coreEn,
  ...inboxEn,
  ...configEn,
  ...analisisEn,
  ...agenteEn,
  ...restoEn,
};
