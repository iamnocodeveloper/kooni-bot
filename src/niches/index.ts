import type { Env } from "../env";
import type { NichePack } from "./types";
import { generico } from "./generico";
import { agenciaIa } from "./agencia-ia";
import { restaurante } from "./restaurante";
import { inmobiliaria } from "./inmobiliaria";
import { clinica } from "./clinica";
import { barberia } from "./barberia";

export type { NichePack, NicheColumn } from "./types";

// Registro de packs. Agregar un nicho = importar su archivo y sumarlo aquí.
// `restaurante` es el pack de referencia para nuevos giros (gimnasio, spa,
// dentista…): copia su estructura. Roadmap de giros: PLAN.md § Nichos por giro.
const PACKS: Record<string, NichePack> = {
  generico,
  "agencia-ia": agenciaIa,
  restaurante,
  inmobiliaria,
  clinica,
  barberia,
};

/** Resuelve el pack activo desde BOT_NICHE. Nicho ausente/desconocido → genérico. */
export function getNiche(env: Env): NichePack {
  const id = (env.BOT_NICHE ?? "").trim().toLowerCase();
  return PACKS[id] ?? generico;
}
