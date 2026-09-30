import type { Lang } from "../i18n";

/**
 * Un mensaje del guion del demo simulado. `de` es quién lo dice.
 * Nada de esto sale a la red: es texto fijo que se anima en el cliente.
 */
export interface DemoMensaje {
  de: "cliente" | "bot";
  texto: string;
}

/**
 * El mismo guion en los dos idiomas del hub, lado a lado. Se elige esta forma
 * (estructuras por idioma) y no claves i18n porque cada guion es una secuencia
 * ordenada de párrafos, no texto suelto de UI: así el es y el en se escriben y
 * se comparan juntos, y el componente solo hace `GUION[lang]`.
 */
export type DemoGuion = Record<Lang, DemoMensaje[]>;
