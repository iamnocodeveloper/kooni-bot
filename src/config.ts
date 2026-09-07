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

// MODELO (2026-09-07): NINGUNA tool ni tab está reservada a Pro. Todas las
// funciones están disponibles en todos los planes; free y Pro se diferencian
// SOLO por los límites de cantidad (`src/limits.ts`). Estos arrays se dejan
// vacíos (no `[]` sin más para no romper imports) por si se quiere volver a un
// modelo con paywall.
export const PRO_ONLY_TOOLS: readonly string[] = [];

export const PRO_ONLY_TABS: readonly string[] = [];

/** Legado — ya no se usa (ningún tab está gateado). */
export const TAB_MODULE: Record<string, string> = {};

/** ¿El tab está permitido? Siempre sí — no hay tabs Pro. */
export async function isTabAllowed(_env: Env, _tab: string): Promise<boolean> {
  return true;
}

/** ¿La tool está disponible? Siempre sí — no hay tools Pro. */
export async function isToolAvailable(_env: Env, _toolName: string): Promise<boolean> {
  return true;
}
