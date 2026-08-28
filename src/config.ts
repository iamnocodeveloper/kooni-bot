import type { Env } from "./env";

export function getBufferMs(env: Env): number {
  return Math.max(1000, parseInt(env.BUFFER_SECONDS, 10) * 1000);
}

export function isPro(env: Env): boolean {
  return env.BOT_TIER === "pro";
}

/** ¿Pro desbloqueado? BOT_TIER=pro O una licencia válida pegada en el panel.
 *  La licencia vive en D1 (settings) y se valida con HMAC, por eso es async.
 *  Úsala en los gates de tier (tabs del panel, tools del agente, imagen, etc.);
 *  `isPro` queda como fast-path síncrono para BOT_TIER. */
export async function isProUnlocked(env: Env): Promise<boolean> {
  if (env.BOT_TIER === "pro") return true;
  try {
    const { isProLicense } = await import("./limits");
    return await isProLicense(env);
  } catch {
    return false;
  }
}

// Tools reservadas al tier Pro. captureLead NO está aquí a propósito: el bot
// Starter (free) captura leads — es su valor central. Lo Pro son las tools más
// avanzadas por nicho (agendar citas, consultar catálogo/inventario).
export const PRO_ONLY_TOOLS = [
  "scheduleAppointment",
  "catalogQuery",
] as const;

// Tabs del dashboard reservadas al tier Pro (Análisis + growth). El tier free
// ve un panel funcional (Resumen, Conversaciones, Leads, Tickets, Flujo, KB,
// Conexiones, Config) pero sin el Analista IA, métricas, costos, mejoras ni
// campañas — esos desbloquean con la comunidad.
export const PRO_ONLY_TABS = ["insights", "stats", "costs", "mejoras", "campanas"] as const;

export function isToolAvailable(env: Env, toolName: string): boolean {
  if (!PRO_ONLY_TOOLS.includes(toolName as (typeof PRO_ONLY_TOOLS)[number])) return true;
  return isPro(env);
}
