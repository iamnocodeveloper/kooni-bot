import type { Env } from "./env";
import { Db } from "./db/client";

/**
 * Límites de uso por tier (free con límites, Pro sin límites).
 *
 * Filosofía: TODAS las funciones disponibles en free (nada bloqueado por
 * feature), solo límites de USO. El pago (Pro) quita los límites.
 * Fail-open: si un chequeo falla, se procede normal (nunca bloquear por error).
 */
export interface Limits {
  maxContacts: number | null; // null = sin límite (Pro)
  maxMessagesPerMonth: number | null;
  maxChannels: number | null;
  maxRules: number | null;
  maxAutoDmsPerMonth: number | null;
  maxTrackedLinks: number | null;
  maxZernioAccounts: number | null;
  logRetentionDays: number | null;
}

/** Límites de la versión gratis. */
export const FREE_LIMITS: Limits = {
  maxContacts: 50,
  maxMessagesPerMonth: 500,
  maxChannels: 2,
  maxRules: 5,
  maxAutoDmsPerMonth: 100,
  maxTrackedLinks: 3,
  maxZernioAccounts: 1,
  logRetentionDays: 7,
};

/** Pro = sin límites (null en todo). */
export const PRO_LIMITS: Limits = {
  maxContacts: null,
  maxMessagesPerMonth: null,
  maxChannels: null,
  maxRules: null,
  maxAutoDmsPerMonth: null,
  maxTrackedLinks: null,
  maxZernioAccounts: null,
  logRetentionDays: null,
};

/** ¿Es Pro? Lee el setting pro_license del panel (código HMAC validado) o BOT_TIER=pro. */
export async function isProLicense(env: Env): Promise<boolean> {
  try {
    const { SettingsRepo, SETTING_KEYS } = await import("./db/settings");
    const code = await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.proLicense);
    if (code) {
      const { verifyLicenseFor } = await import("./license");
      return verifyLicenseFor(env, code, { instanceUid: env.BOT_INSTANCE_ID });
    }
  } catch (e) {
    console.warn("[limits] isProLicense falló:", e);
  }
  return false;
}

/** Devuelve los límites efectivos según el tier. */
export async function getLimits(env: Env): Promise<Limits> {
  const pro = await isProLicense(env);
  return pro ? PRO_LIMITS : FREE_LIMITS;
}

// ── Chequeos de uso (fail-open) ──────────────────────────────────────────────

export interface UsageCounts {
  contacts: number;
  messagesThisMonth: number;
  rules: number;
  autoDmsThisMonth: number;
  trackedLinks: number;
}

/** Cuenta el uso actual del bot. Nunca truena: falla → ceros (fail-open). */
export async function getUsage(env: Env): Promise<UsageCounts> {
  const db = new Db(env.DB);
  const out: UsageCounts = { contacts: 0, messagesThisMonth: 0, rules: 0, autoDmsThisMonth: 0, trackedLinks: 0 };
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  try {
    const c = await db.first<{ n: number }>("SELECT COUNT(*) as n FROM conversations");
    out.contacts = c?.n ?? 0;
  } catch {}
  try {
    const m = await db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM messages WHERE created_at >= ?",
      [monthStart.getTime()],
    );
    out.messagesThisMonth = m?.n ?? 0;
  } catch {}
  try {
    const r = await db.first<{ n: number }>("SELECT COUNT(*) as n FROM auto_rules");
    out.rules = r?.n ?? 0;
  } catch {}
  try {
    const d = await db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM dm_logs WHERE created_at >= ?",
      [monthStart.getTime()],
    );
    out.autoDmsThisMonth = d?.n ?? 0;
  } catch {}
  try {
    const l = await db.first<{ n: number }>("SELECT COUNT(*) as n FROM auto_rule_links");
    out.trackedLinks = l?.n ?? 0;
  } catch {}
  return out;
}

export interface LimitCheck {
  allowed: boolean;
  limit: number | null;
  used: number;
  resource: string;
}

/**
 * Chequea si se puede crear un recurso nuevo. Fail-open: si el chequeo falla,
 * allowed=true (nunca bloquear por error).
 */
export async function checkLimit(env: Env, resource: keyof UsageCounts, extra = 1): Promise<LimitCheck> {
  try {
    const limits = await getLimits(env);
    const max: number | null =
      resource === "contacts" ? limits.maxContacts
      : resource === "messagesThisMonth" ? limits.maxMessagesPerMonth
      : resource === "rules" ? limits.maxRules
      : resource === "autoDmsThisMonth" ? limits.maxAutoDmsPerMonth
      : limits.maxTrackedLinks;
    if (max === null) return { allowed: true, limit: null, used: 0, resource };
    const usage = await getUsage(env);
    const used = usage[resource];
    return { allowed: used + extra <= max, limit: max, used, resource };
  } catch (e) {
    console.warn(`[limits] checkLimit(${resource}) falló — fail-open:`, e);
    return { allowed: true, limit: null, used: 0, resource };
  }
}

/** Mensaje amable de límite alcanzado (se muestra 1 vez por conversación). */
export function limitMessage(resource: string, used: number, limit: number): string {
  const labels: Record<string, string> = {
    contacts: "contactos registrados",
    messagesThisMonth: "mensajes este mes",
    rules: "reglas de automatización",
    autoDmsThisMonth: "respuestas automáticas este mes",
    trackedLinks: "links trackeados",
  };
  const label = labels[resource] ?? resource;
  return `Llegaste al límite gratis de ${label} (${used}/${limit}). Tu bot sigue funcionando, pero no puede registrar más este mes. Para quitar todos los límites, activa Pro desde el panel (Conexiones → Licencia).`;
}
