/**
 * Admin dashboard authentication — sesión por cookie (página propia) + HTTP
 * Basic Auth (compat: scripts, healthchecks y ~7 archivos de test que
 * autentican con un header `Authorization: Basic ...`).
 *
 * El navegador humano ve una página de login real (`GET/POST /admin/login`,
 * ver `views/layout.ts` y `routes.ts`) que abre una sesión por cookie firmada
 * — sin tabla nueva en D1: el HMAC usa `DASHBOARD_PASSWORD` como llave, así
 * que rotar la contraseña invalida todas las sesiones viejas solas. Cualquier
 * request que ya traiga `Authorization: Basic admin:<password>` válido sigue
 * entrando igual que antes (no se tocó ese camino).
 */
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../env";

/** Fixed username for the admin dashboard. */
export const ADMIN_USERNAME = "admin";

/** Nombre de la cookie de sesión del panel. */
export const SESSION_COOKIE = "kooni_admin_session";

/** Duración de la sesión: 30 días desde el login. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Constant-time string comparison to avoid leaking length/content via timing.
 * Returns true only when both strings are byte-for-byte identical.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Fold the length mismatch into the result while still iterating over the
  // longer of the two to keep timing stable.
  let diff = ab.length ^ bb.length;
  const max = Math.max(ab.length, bb.length);
  for (let i = 0; i < max; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Decode a base64 string in both Worker (atob) and Node/test (Buffer) runtimes. */
function decodeBase64(input: string): string | null {
  try {
    if (typeof atob === "function") {
      return atob(input);
    }
    return Buffer.from(input, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * Pure credential check for an HTTP `Authorization` header value.
 *
 * Accepts a value like `Basic YWRtaW46c2VjcmV0MTIz` and returns true only when
 * it decodes to `admin:<DASHBOARD_PASSWORD>`. Has no Hono dependency so it can
 * be unit-tested directly.
 *
 * @param headerValue the raw `Authorization` header value (may be undefined/null)
 * @param env         environment carrying `DASHBOARD_PASSWORD`
 */
export function checkBasicCredentials(
  headerValue: string | null | undefined,
  env: Env,
): boolean {
  if (!headerValue) return false;

  const match = /^Basic\s+(.+)$/i.exec(headerValue.trim());
  if (!match) return false;

  const decoded = decodeBase64(match[1].trim());
  if (decoded === null) return false;

  // Split only on the FIRST colon: passwords may legitimately contain colons.
  const sep = decoded.indexOf(":");
  if (sep === -1) return false;

  const username = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);

  const userOk = timingSafeEqual(username, ADMIN_USERNAME);
  const passOk = timingSafeEqual(password, env.DASHBOARD_PASSWORD ?? "");
  return userOk && passOk;
}

/**
 * ¿El password del formulario de login (`POST /admin/login`) coincide con
 * `DASHBOARD_PASSWORD`? Comparación en tiempo constante (mismo helper que Basic
 * Auth). El usuario es fijo ("admin"), así que solo se compara la contraseña.
 */
export function verifyDashboardPassword(env: Env, password: string): boolean {
  return timingSafeEqual(password ?? "", env.DASHBOARD_PASSWORD ?? "");
}

/** HMAC-SHA256(DASHBOARD_PASSWORD, expiry) en hex. Sync — mismo patrón que license.ts. */
function sessionSignature(env: Env, expiry: number): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require("node:crypto");
  return createHmac("sha256", env.DASHBOARD_PASSWORD ?? "").update(String(expiry)).digest("hex");
}

/** Valor de la cookie de sesión: `<expiry_epoch_ms>.<hmac_hex>`. Sin estado en D1. */
export function buildSessionCookieValue(env: Env): string {
  const expiry = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  return `${expiry}.${sessionSignature(env, expiry)}`;
}

/** ¿La cookie de sesión es válida y no venció? Rotar DASHBOARD_PASSWORD la invalida sola. */
export function verifySessionCookie(env: Env, value: string | undefined | null): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const expiry = Number(value.slice(0, dot));
  const sig = value.slice(dot + 1);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;
  return timingSafeEqual(sig, sessionSignature(env, expiry));
}

/** Pone la cookie de sesión tras un login correcto. */
export function setSessionCookie(c: Context, env: Env): void {
  setCookie(c, SESSION_COOKIE, buildSessionCookieValue(env), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Borra la cookie de sesión (logout). */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** ¿Hay una cookie de sesión válida en esta request? (ignora Basic Auth). */
export function hasValidSessionCookie(c: Context, env: Env): boolean {
  return verifySessionCookie(env, getCookie(c, SESSION_COOKIE));
}

/** ¿Es una navegación de navegador (carga de página), no htmx/API/script? */
function isBrowserNavigation(c: Context): boolean {
  const accept = c.req.header("Accept") ?? "";
  const isHtmx = c.req.header("HX-Request") === "true";
  return !isHtmx && accept.includes("text/html");
}

/**
 * Hono middleware factory. `/admin/login` y `/admin/logout` quedan afuera (se
 * registran antes en `routes.ts`).
 *
 * - **Carga de página en el navegador** → SOLO cuenta la cookie de sesión. Así
 *   una credencial Basic Auth vieja guardada en el navegador NO se salta la
 *   página de login ni impide cerrar sesión. Sin cookie → 302 a `/admin/login`.
 * - **Todo lo demás** (htmx, API, scripts, healthchecks, tests) → cookie **o**
 *   Basic Auth, como siempre. Sin credenciales → 401.
 */
export function adminAuth(env: Env): MiddlewareHandler {
  return async (c, next) => {
    const cookieOk = hasValidSessionCookie(c, env);

    if (isBrowserNavigation(c)) {
      if (cookieOk) return next();
      return c.redirect("/admin/login", 302);
    }

    if (cookieOk || checkBasicCredentials(c.req.header("Authorization"), env)) {
      return next();
    }
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Kooni", charset="UTF-8"' },
    });
  };
}
