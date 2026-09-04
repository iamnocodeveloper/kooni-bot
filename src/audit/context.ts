// Contexto de auditoría por request (§ U). Un middleware del panel envuelve
// cada request MUTANTE de `/admin` con `runWithActor({...}, next)`. Cualquier
// código que escriba en D1 dentro de esa cadena (p. ej. `SettingsRepo.set`)
// puede llamar `recordAudit()` y la fila queda ligada al operador.
//
// Fuera del panel (escrituras del bot, crons, flywheel) NO hay actor en el
// store → `recordAudit()` es un no-op silencioso. Así solo se audita lo que
// hace una persona en el panel, que es lo que pidió el registro.
//
// AsyncLocalStorage funciona en Workers con `nodejs_compat` (mismo runtime que
// ya usa `node:crypto` en `src/admin/auth.ts`). Si algún día deja de propagar
// a través de los `await` de Hono, el plan B es pasar el actor explícito.
import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "../db/client";
import { AuditRepo, type AuditInput } from "../db/auditLog";

export interface AuditActor {
  /** Nivel A: siempre "admin" (login único). Reservado para Nivel B/C. */
  name?: string;
  /** SHA-256 de la IP (nunca la IP en claro). */
  ipHash?: string;
  /** User-agent, recortado. */
  ua?: string;
  method?: string;
  path?: string;
}

const store = new AsyncLocalStorage<AuditActor>();

export function runWithActor<T>(actor: AuditActor, fn: () => T): T {
  return store.run(actor, fn);
}

export function currentActor(): AuditActor | undefined {
  return store.getStore();
}

/**
 * Claves de `settings` cuyo valor NUNCA se guarda en claro en el registro
 * (el registro se ve en el panel). Se guardan redactadas.
 */
export const AUDIT_SENSITIVE_KEYS = new Set<string>([
  "llm_api_key",
  "zernio_api_key",
  "zernio_webhook_secret",
  "telegram_bot_token",
  "owner_telegram_chat_id",
  "ml_client_id",
  "ml_client_secret",
  "ml_access_token",
  "ml_refresh_token",
  "ml_oauth_state",
  "pro_license",
  "waha_api_key",
  "waha_webhook_token",
]);

const MAX_VALUE_LEN = 2000;

/** Redacta el valor si la clave es sensible; si no, lo recorta. */
export function redactValue(key: string | undefined, value: string | null | undefined): string {
  const v = (value ?? "").toString();
  if (key && AUDIT_SENSITIVE_KEYS.has(key)) {
    if (v.trim() === "") return "[vacío]";
    return `[secreto · termina en …${v.slice(-4)}]`;
  }
  return v.length > MAX_VALUE_LEN ? v.slice(0, MAX_VALUE_LEN) + "…" : v;
}

/**
 * Registra una acción del panel. No-op silencioso si:
 *  - no hay actor en el contexto (escritura del bot / cron), o
 *  - la escritura del registro falla (nunca bloquea la acción real).
 */
export async function recordAudit(db: Db, entry: AuditInput): Promise<void> {
  const actor = currentActor();
  if (!actor) return;
  try {
    await new AuditRepo(db).log({
      ...entry,
      actorName: entry.actorName ?? actor.name,
      actorIpHash: entry.actorIpHash ?? actor.ipHash,
      actorUa: entry.actorUa ?? actor.ua,
      method: entry.method ?? actor.method,
      path: entry.path ?? actor.path,
    });
  } catch (e) {
    console.warn("[audit] no se pudo registrar la acción:", e);
  }
}
