import type { Env } from "./env";
import { Db } from "./db/client";
import { PushSubsRepo, PushEventsRepo } from "./db/push";

// Web Push (VAPID) — avisos al celular del dueño con el panel instalado como PWA.
//
// DECISIÓN: el push va SIN cuerpo (no ciframos el payload, RFC 8291 es frágil de
// implementar a mano). El service worker, al recibir el push, pide
// /admin/push/latest y muestra el aviso más reciente. Ver src/admin/pwa.ts.
//
// Solo hace falta firmar el JWT de VAPID (ES256). Requiere en el worker:
//   VAPID_PUBLIC_KEY   (var, base64url — la misma que usa el cliente)
//   VAPID_PRIVATE_KEY  (secret, base64url — 32 bytes)
//   VAPID_SUBJECT      (var, "mailto:tu@correo")
// Sin las tres, pushConfigured() = false y no se manda nada.

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pushConfigured(env: Env): boolean {
  return Boolean(
    (env.VAPID_PUBLIC_KEY ?? "").trim() &&
      (env.VAPID_PRIVATE_KEY ?? "").trim() &&
      (env.VAPID_SUBJECT ?? "").trim(),
  );
}

export function vapidPublicKey(env: Env): string {
  return (env.VAPID_PUBLIC_KEY ?? "").trim();
}

/** Importa la clave privada de VAPID (necesita la pública para reconstruir el JWK). */
async function importVapidKey(env: Env): Promise<CryptoKey> {
  const pub = b64urlToBytes((env.VAPID_PUBLIC_KEY ?? "").trim()); // 65 bytes: 0x04 || x || y
  const d = (env.VAPID_PRIVATE_KEY ?? "").trim();
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d,
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** JWT de VAPID (RFC 8292) para un endpoint. `aud` = origen del endpoint. */
async function vapidJwt(env: Env, audience: string): Promise<string> {
  const enc = new TextEncoder();
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: (env.VAPID_SUBJECT ?? "").trim(),
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const key = await importVapidKey(env);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput),
  );
  return `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
}

interface SendResult {
  ok: boolean;
  gone: boolean;
  status: number;
}

/** Manda un push SIN cuerpo a una suscripción. `gone` = borrar la suscripción. */
async function sendBodyless(env: Env, endpoint: string): Promise<SendResult> {
  const audience = new URL(endpoint).origin;
  const jwt = await vapidJwt(env, audience);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "43200",
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey(env)}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  return {
    ok: res.status >= 200 && res.status < 300,
    gone: res.status === 404 || res.status === 410,
    status: res.status,
  };
}

/**
 * Encola un aviso y lo empuja a todos los dispositivos suscritos. Best-effort:
 * nunca lanza; limpia las suscripciones muertas (404/410).
 */
export async function notifyOwnerPush(
  env: Env,
  event: { title: string; body: string; url?: string },
): Promise<void> {
  if (!pushConfigured(env)) return;
  try {
    const db = new Db(env.DB);
    await new PushEventsRepo(db).add(event);
    const subs = new PushSubsRepo(db);
    const list = await subs.all();
    for (const s of list) {
      try {
        const r = await sendBodyless(env, s.endpoint);
        if (r.ok) await subs.markOk(s.endpoint);
        else if (r.gone) await subs.remove(s.endpoint);
        else console.warn(`[push] ${s.endpoint.slice(0, 40)}… → HTTP ${r.status}`);
      } catch (e) {
        console.warn("[push] envío falló:", e);
      }
    }
  } catch (e) {
    console.error("[push] notifyOwnerPush:", e);
  }
}
