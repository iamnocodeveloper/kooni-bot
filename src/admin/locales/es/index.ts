import { es as coreEs } from "./core";
import { inboxEs } from "./inbox";
import { configEs } from "./config";
import { analisisEs } from "./analisis";
import { agenteEs } from "./agente";
import { restoEs } from "./resto";

/** Diccionario ES completo = core + cada área. El español es la fuente de verdad.
 *  La anotación por intersección preserva las CLAVES literales (si no, el spread
 *  ensancha el tipo y `t()` deja de validar claves). */
export const es: typeof coreEs &
  typeof inboxEs &
  typeof configEs &
  typeof analisisEs &
  typeof agenteEs &
  typeof restoEs = { ...coreEs, ...inboxEs, ...configEs, ...analisisEs, ...agenteEs, ...restoEs };
