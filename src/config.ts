import type { Env } from "./env";

export function getBufferMs(env: Env): number {
  return Math.max(1000, parseInt(env.BUFFER_SECONDS, 10) * 1000);
}

export function isPro(env: Env): boolean {
  return false; // Pro ya NO se activa por var BOT_TIER — solo con licencia (v2 Ed25519)
}

/** ¿Pro desbloqueado? SOLO con una licencia válida pegada en el panel (v2).
 *  Quien instale el template sin licencia queda en free — no hay bypass por var.
 *  La licencia vive en D1 (settings) y se valida con firma Ed25519, por eso async. */
export async function isProUnlocked(env: Env): Promise<boolean> {
  try {
    const { isProLicense } = await import("./limits");
    return await isProLicense(env);
  } catch {
    return false;
  }
}

// Tools reservadas al tier Pro. captureLead y scheduleAppointment NO están acá
// a propósito: el bot Starter (free) captura leads Y agenda citas — es su valor
// central (ver src/tools/index.ts, se registran siempre). Lo Pro es consultar
// catálogo/inventario y las tools avanzadas por nicho.
export const PRO_ONLY_TOOLS = ["catalogQuery"] as const;

// Tabs del dashboard reservadas al tier Pro (Análisis + growth). El tier free
// ve un panel funcional (Resumen, Conversaciones, Leads, Tickets, Flujo, KB,
// Conexiones, Config) pero sin el Analista IA, métricas, costos, mejoras ni
// campañas — esos desbloquean con la comunidad.
export const PRO_ONLY_TABS = ["insights", "stats", "costs", "mejoras", "campanas", "auditoria"] as const;

// Cada tab Pro se vende como un MÓDULO (ver src/modules.ts). Un código de
// licencia puede incluir módulos específicos; la licencia legada (sin modules)
// y el tier pro los desbloquean todos.
export const TAB_MODULE: Record<(typeof PRO_ONLY_TABS)[number], string> = {
  insights: "analista",
  stats: "metricas",
  costs: "costos",
  mejoras: "mejoras",
  campanas: "campanas",
  auditoria: "auditoria",
};

/**
 * ¿El tab está permitido? Los tabs Pro dependen de su módulo (o de la licencia
 * completa). Los tabs normales siempre están permitidos.
 */
export async function isTabAllowed(env: Env, tab: string): Promise<boolean> {
  if (!(PRO_ONLY_TABS as readonly string[]).includes(tab)) return true;
  const { isModuleUnlocked } = await import("./modules");
  return isModuleUnlocked(env, TAB_MODULE[tab as keyof typeof TAB_MODULE]);
}

export async function isToolAvailable(env: Env, toolName: string): Promise<boolean> {
  if (!PRO_ONLY_TOOLS.includes(toolName as (typeof PRO_ONLY_TOOLS)[number])) return true;
  return isProUnlocked(env);
}
