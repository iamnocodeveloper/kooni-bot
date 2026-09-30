// Guiones del demo simulado, uno por giro. Ninguno tiene backend, fetch ni
// WhatsApp: son arreglos de mensajes que `components/DemoChat.tsx` anima.
import type { DemoGuion } from "./types";
import { demoGenerico } from "./generico";
import { demoAgenciaIa } from "./agencia-ia";
import { demoRestaurante } from "./restaurante";
import { demoInmobiliaria } from "./inmobiliaria";
import { demoClinica } from "./clinica";
import { demoBarberia } from "./barberia";
import { demoCartera } from "./cartera";
import { demoTaxis } from "./taxis";

export type { DemoMensaje, DemoGuion } from "./types";

/** id del giro → guion (es/en). Inmobiliaria va a fondo; el resto, corto. */
export const DEMOS: Record<string, DemoGuion> = {
  generico: demoGenerico,
  "agencia-ia": demoAgenciaIa,
  restaurante: demoRestaurante,
  inmobiliaria: demoInmobiliaria,
  clinica: demoClinica,
  barberia: demoBarberia,
  cartera: demoCartera,
  taxis: demoTaxis,
};
