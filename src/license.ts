import type { Env } from "./env";

/**
 * Licencias Pro por código (sin servidor de licencias).
 *
 * El dueño de la plataforma genera códigos con `scripts/gen-license.ts` usando
 * un secret (`LICENSE_MASTER_KEY` en el worker). El usuario pega el código en
 * el panel → se valida localmente (HMAC) → se guarda en settings → Pro activo.
 *
 * Formato del código:  KOONI-PRO-<payload-base64url>.<sig-hex>
 *   payload = JSON firmado: { kind: "lifetime" | "monthly", expiry?: epoch_ms, bot?: slug }
 *   sig     = HMAC-SHA256(secret, payload)
 *
 * - lifetime: expiry ausente → nunca expira.
 * - monthly:  expiry presente → el panel valida contra la fecha.
 * - bot:      opcional, limita el código a un slug de bot (para códigos por bot).
 *
 * TODO se valida localmente: sin servidor, sin llamadas externas.
 */

export interface LicensePayload {
  kind: "lifetime" | "monthly";
  expiry?: number; // epoch_ms (monthly)
  bot?: string; // slug del bot (opcional)
  inst?: string; // uid de 6 chars de la instalación (opcional; liga el código a UNA instalación)
  // Módulos de pago incluidos (ej. ["nightly_report", "analista"]).
  // AUSENTE = licencia legada → Pro completo (todos los módulos).
  modules?: string[];
}

export function encodeLicensePayload(payload: LicensePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeLicensePayload(encoded: string): LicensePayload | null {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as LicensePayload;
  } catch {
    return null;
  }
}

/** Genera el código de licencia firmado (para el script del dueño). */
export function generateLicense(secret: string, payload: LicensePayload): string {
  const enc = encodeLicensePayload(payload);
  const sig = hmacHex(secret, enc);
  return `KOONI-PRO-${enc}.${sig}`;
}

function hmacHex(secret: string, data: string): string {
  // HMAC-SHA256 en hex, síncrono (WebCrypto es async; para el script usamos node:crypto).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require("node:crypto");
  return createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Verifica un código de licencia contra el master key.
 * Devuelve el payload si es válido y vigente; null si no.
 */
export function verifyLicense(code: string, env: Env): LicensePayload | null {
  const secret = env.LICENSE_MASTER_KEY;
  if (!secret) return null;
  const trimmed = code?.trim() ?? "";
  const prefix = "KOONI-PRO-";
  if (!trimmed.startsWith(prefix)) return null;
  const rest = trimmed.slice(prefix.length);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  const enc = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  if (hmacHex(secret, enc) !== sig) return null;
  const payload = decodeLicensePayload(enc);
  if (!payload) return null;
  if (payload.kind === "monthly" && payload.expiry && Date.now() > payload.expiry) {
    return null; // vencida
  }
  return payload;
}

/** ¿El código es válido Y aplica a este bot/instalación? */
export function verifyLicenseFor(
  env: Env,
  code: string,
  opts: { botSlug?: string; instanceUid?: string } = {},
): boolean {
  const payload = verifyLicense(code, env);
  if (!payload) return false;
  if (payload.bot && opts.botSlug && payload.bot !== opts.botSlug) return false;
  if (payload.inst && opts.instanceUid && payload.inst !== opts.instanceUid) return false;
  return true;
}
