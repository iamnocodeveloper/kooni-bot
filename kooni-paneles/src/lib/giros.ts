// Giros (packs de nicho) que trae Kooni.
//
// Fuente única de verdad: la usan el panel (`pages/Plantillas.tsx`) y la
// landing pública (`pages/GirosPublico.tsx`, `pages/GiroPublico.tsx`).
//
// El nombre y la descripción de una línea de cada giro ya existen como claves
// i18n en los locales es/en (`client.ts`, áreas cliente): `pla.giro.<id>.name`
// y `pla.giro.<id>.desc`. Acá no se duplica texto, solo se referencia.
//
// El import de `MessageKey` es `import type`: se borra al compilar, así que no
// hay ciclo en runtime entre este módulo y el sistema de i18n.
import type { MessageKey } from "./i18n";

export interface Giro {
  id: string;
  emoji: string;
}

/** Los 8 giros, en el orden en que se muestran. */
export const GIROS: Giro[] = [
  { id: "generico", emoji: "🤖" },
  { id: "agencia-ia", emoji: "🚀" },
  { id: "restaurante", emoji: "🍽️" },
  { id: "inmobiliaria", emoji: "🏠" },
  { id: "clinica", emoji: "🩺" },
  { id: "barberia", emoji: "💈" },
  { id: "cartera", emoji: "💰" },
  { id: "taxis", emoji: "🚕" },
];

/** Devuelve el giro o `undefined` si el id no es conocido. */
export function findGiro(id: string | undefined): Giro | undefined {
  if (!id) return undefined;
  return GIROS.find((g) => g.id === id);
}

/** Nombre del giro ("Inmobiliaria"). Clave reusada del panel. */
export function giroNameKey(id: string): MessageKey {
  return `pla.giro.${id}.name` as MessageKey;
}

/** Descripción de una línea del giro. Clave reusada del panel. */
export function giroDescKey(id: string): MessageKey {
  return `pla.giro.${id}.desc` as MessageKey;
}

/** El dolor del giro en una frase (texto propio de la landing). */
export function giroPainKey(id: string): MessageKey {
  return `lp.giro.${id}.pain` as MessageKey;
}

/** El bullet n (1..4) de "qué hace, en concreto". */
export function giroBulletKey(id: string, n: number): MessageKey {
  return `lp.giro.${id}.b${n}` as MessageKey;
}

/** El comando real de instalación del giro. */
export function installCommand(id: string): string {
  return `npx kooni-bot install ${id}`;
}
