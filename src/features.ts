/**
 * Funciones de pago del menú "Extras" (Forja+) — toggles por feature que el
 * dueño enciende/apaga, y que actúan en el BOT o el PANEL según la función.
 *
 * Cada feature tiene:
 *   - un TOGGLE en el panel (setting feature_*_enabled, "0"|"1") → lo decide
 *     el usuario del bot,
 *   - y un MÓDULO de pago (src/modules.ts) → decide si la función está
 *     DISPONIBLE en esa instalación (licencia/override). Con toggle on pero
 *     módulo bloqueado, la función no hace nada y el panel lo muestra 🔒.
 */
import type { Env } from "./env";
import { Db } from "./db/client";
import { SettingsRepo, SETTING_KEYS } from "./db/settings";
import { unlockedModules } from "./modules";

/** Settings de los toggles del menú Extras. */
export const FEATURE_KEYS = {
  blindaje: "feature_blindaje_enabled",
  vigilante: "feature_vigilante_enabled",
  handoff: "feature_handoff_enabled",
} as const;

export type ExtraFeatureId = keyof typeof FEATURE_KEYS;

export interface ExtraFeature {
  id: ExtraFeatureId;
  /** Módulo de pago que la desbloquea (src/modules.ts). */
  module: string;
  nombre: string;
  emoji: string;
  descripcion: string;
  /** Dónde actúa cuando está encendida. */
  actuaEn: "bot" | "panel" | "bot+panel";
  tipo: "pago_unico" | "membresia";
}

/** Catálogo del menú Extras (el orden es el del grid). */
export const EXTRA_FEATURES: ExtraFeature[] = [
  {
    id: "blindaje",
    module: "blindaje",
    nombre: "Blindaje anti-inventos",
    emoji: "🛡️",
    descripcion:
      "Tu bot verifica cada respuesta contra tu información real antes de mandarla. Si no está seguro, no adivina: dice “déjame confirmarlo” y te pasa el chat. Cero promesas que no ofreces.",
    actuaEn: "bot",
    tipo: "membresia",
  },
  {
    id: "vigilante",
    module: "vigilante",
    nombre: "Vigilante con IA",
    emoji: "👁️",
    descripcion:
      "Cada conversación se revisa sola mientras atiende. Si un cliente se enoja o una venta se está cayendo, te llega el aviso al momento — el bot SIGUE atendiendo, solo te avisa.",
    actuaEn: "bot+panel",
    tipo: "membresia",
  },
  {
    id: "handoff",
    module: "handoff_smart",
    nombre: "Handoff que sí atina",
    emoji: "🤝",
    descripcion:
      "El bot distingue el momento justo de pasarte el chat: cliente molesto, queja, factura o lead caliente → te lo entrega con todo el contexto. Lo simple lo resuelve solo, no te satura.",
    actuaEn: "bot",
    tipo: "membresia",
  },
];

/** Texto que se inyecta al prompt del agente cuando el Blindaje está encendido. */
export const BLINDAJE_PROMPT_BLOCK = `<blindaje_anti_inventos>
Regla de oro del dueño (BLINDAJE): tu palabra es la del negocio, y una promesa que no puedes cumplir es peor que un "no sé".

- Responde SOLO con datos que puedes respaldar con la información del negocio o la base de conocimiento.
- NUNCA inventes: precios, descuentos, envíos, tallas, disponibilidad, horarios, plazos, costos de tratamientos ni condiciones.
- Si el cliente pregunta algo que NO está en tu información (ej. "¿hacen envíos a otra ciudad?"), NO lo adivines ni lo confirmes. Responde: "Déjame confirmarlo con el equipo y te aviso aquí mismo en un momento" e inmediatamente llama handoffHuman con el contexto, para que el dueño responda con certeza.
- Un "déjame confirmarlo" honesto vale más que un dato inventado. Cuando el dueño responda, retomas y le das el dato real.
</blindaje_anti_inventos>`;

/** Texto que se inyecta al prompt del agente cuando el Handoff inteligente está encendido. */
export const HANDOFF_PROMPT_BLOCK = `<handoff_inteligente>
Reglas del dueño (HANDOFF QUE SÍ ATINA): ni te satures con lo simple, ni te quedes fuera cuando importa.

ESCALA con handoffHuman INMEDIATAMENTE (no lo intentes resolver solo) cuando el cliente:
- está molesto o se queja (queja de cobro, cargo extra, factura, mala atención, demora),
- pide factura / comprobante / hablar con alguien del equipo,
- es un lead CALIENTE: intención real de compra/contratar que necesita confirmación del dueño (precios grandes, condiciones, disponibilidad).
- pide un humano o el dueño.

Entrega SIEMPRE el contexto completo al escalar: quién es, qué quiere y qué pasó.
Lo simple (dudas de horarios, información del negocio, saludos, dudas informativas) lo resuelves TÚ solo, sin molestar al dueño.
Nunca confirmes al cliente un dato que el dueño debe dar (ej. "sí, hay factura") — escala y deja que el dueño lo confirme.
</handoff_inteligente>`;

/**
 * Estado del menú Extras con un snapshot de settings (evita re-leer D1).
 * Devuelve, por feature: activada (toggle on) y disponible (módulo pago on).
 */
export async function extrasState(
  env: Env,
  settings?: Record<string, string>,
): Promise<Record<ExtraFeatureId, { on: boolean; unlocked: boolean }>> {
  const snapshot =
    settings ?? ((await new SettingsRepo(new Db(env.DB)).all().catch(() => ({}))) as Record<string, string>);
  const mods = await unlockedModules(env, snapshot);
  const state = {} as Record<ExtraFeatureId, { on: boolean; unlocked: boolean }>;
  for (const f of EXTRA_FEATURES) {
    state[f.id] = {
      on: snapshot[FEATURE_KEYS[f.id]] === "1",
      unlocked: mods.has(f.module),
    };
  }
  return state;
}

/**
 * Bloques de prompt + flags que el agente necesita según el menú Extras.
 * Llamado por resolveAgentConfig (que ya tiene el snapshot de settings).
 */
export async function extrasForAgent(
  env: Env,
  settings: Record<string, string>,
): Promise<{ extraInstructions: string[]; vigilanteEnabled: boolean }> {
  const mods = await unlockedModules(env, settings);
  const extraInstructions: string[] = [];
  if (settings[FEATURE_KEYS.blindaje] === "1" && mods.has("blindaje")) {
    extraInstructions.push(BLINDAJE_PROMPT_BLOCK);
  }
  if (settings[FEATURE_KEYS.handoff] === "1" && mods.has("handoff_smart")) {
    extraInstructions.push(HANDOFF_PROMPT_BLOCK);
  }
  return {
    extraInstructions,
    vigilanteEnabled: settings[FEATURE_KEYS.vigilante] === "1" && mods.has("vigilante"),
  };
}
