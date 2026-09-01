import type { Env } from "./env";

/**
 * Licencias Pro por código — FIRMA ASIMÉTRICA Ed25519 (v2).
 *
 * Solo el dueño puede generar códigos: la clave PRIVADA vive únicamente en el
 * panel de licencias (InsForge, secret LICENSE_PRIVATE_KEY). Cada instalación
 * lleva SOLO la clave PÚBLICA (segura para distribuir: verifica sin poder
 * firmar). Quien instale desde GitHub/npm no puede forjar códigos — sin
 * licencia válida el bot queda en free.
 *
 * Formato v2:  KOONI-PRO-V2-<payload-base64url>.<sig-hex>
 *   payload = JSON firmado: { kind: "lifetime" | "monthly", expiry?, bot?, inst?, modules? }
 *   sig     = Ed25519(payload-utf8) con la privada del panel
 *   verif   = Ed25519(payload-utf8) con la pública de esta instalación
 *
 * El formato v1 (HMAC con LICENSE_MASTER_KEY) queda DESACTIVADO: la llave
 * maestra ya no se distribuye.
 */

export interface LicensePayload {
  kind: "lifetime" | "monthly";
  expiry?: number; // epoch_ms (monthly)
  bot?: string; // slug del bot (opcional)
  inst?: string; // uid de 6 chars de la instalación (opcional; liga el código a UNA instalación)
  modules?: string[]; // módulos de pago incluidos; AUSENTE = Pro completo
}

// Clave PÚBLICA Ed25519 (DER SPKI, base64) — pública por diseño: solo verifica.
// Los tests pueden inyectar otra vía env.LICENSE_PUBLIC_KEY.
const LICENSE_PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEAqpP9OBrju8ebMWjQM4uYLsUV5yqWG8k8ieozT8Me8EQ=";

/** Genera un código v2 firmado con la clave PRIVADA (solo el dueño la tiene). */
export function generateLicenseV2(privB64: string, payload: LicensePayload): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPrivateKey, sign } = require("node:crypto");
  const enc = encodeLicensePayload(payload);
  const key = createPrivateKey({ key: Buffer.from(privB64, "base64"), format: "der", type: "pkcs8" });
  const sig = sign(null, Buffer.from(enc, "utf8"), key).toString("hex");
  return `KOONI-PRO-V2-${enc}.${sig}`;
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

/** Verifica la firma Ed25519 (node:crypto — sync, compatible con workers). */
function verifyEd25519(derB64: string, data: Buffer, sigHex: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPublicKey, verify } = require("node:crypto");
    const pub = createPublicKey({ key: Buffer.from(derB64, "base64"), format: "der", type: "spki" });
    return verify(null, data, pub, Buffer.from(sigHex, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verifica un código de licencia v2 (Ed25519). Devuelve el payload si es válido
 * y vigente; null si no. No requiere ningún secret en el worker.
 */
export function verifyLicense(code: string, env?: Env): LicensePayload | null {
  const pubB64 = env?.LICENSE_PUBLIC_KEY || LICENSE_PUBLIC_KEY_B64;
  const trimmed = code?.trim() ?? "";
  const prefix = "KOONI-PRO-V2-";
  if (!trimmed.startsWith(prefix)) return null;
  const rest = trimmed.slice(prefix.length);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  const enc = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  if (!verifyEd25519(pubB64, Buffer.from(enc, "utf8"), sig)) return null;
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
