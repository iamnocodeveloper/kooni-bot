// MercadoLibre — credenciales + OAuth del canal (preguntas + mensajería
// post-venta). Cada bot usa SU PROPIA app de developers.mercadolibre.com,
// creada en la cuenta del vendedor. No hay app central: todo el estado
// (App ID, Secret, tokens) vive en la tabla `settings` de D1, así que el canal
// se conecta desde el panel sin `wrangler secret put` ni redeploy.
//
// Flujo OAuth (authorization code):
//   1. El dueño guarda App ID + Secret + país en /admin/conexiones.
//   2. "Autorizar" → GET /admin/conexiones/mercadolibre/oauth → redirige al
//      login de MercadoLibre con un `state` anti-CSRF guardado en settings.
//   3. MercadoLibre devuelve al navegador a
//      GET /webhooks/mercadolibre/oauth?code=...&state=...  (ruta pública).
//   4. Se intercambia el `code` por { access_token, refresh_token, user_id }.
//
// Tokens: el access token vive ~6h; el refresh token dura 6 meses PERO es de un
// solo uso (MercadoLibre lo rota en cada refresh). getMlAccessToken() refresca
// bajo demanda y persiste el token rotado.
import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const API_BASE = "https://api.mercadolibre.com";

/** Países de MercadoLibre soportados (site_id → nombre). */
export const ML_SITES: { id: string; label: string }[] = [
  { id: "MLA", label: "Argentina" },
  { id: "MLM", label: "México" },
  { id: "MLB", label: "Brasil" },
  { id: "MLC", label: "Chile" },
  { id: "MCO", label: "Colombia" },
  { id: "MLU", label: "Uruguay" },
  { id: "MPE", label: "Perú" },
  { id: "MLV", label: "Venezuela" },
  { id: "MEC", label: "Ecuador" },
  { id: "MBO", label: "Bolivia" },
  { id: "MPY", label: "Paraguay" },
  { id: "MCR", label: "Costa Rica" },
  { id: "MPA", label: "Panamá" },
  { id: "MRD", label: "Rep. Dominicana" },
];

/** Dominio del login del vendedor (autorización) por país. */
export function mlAuthDomain(site: string | undefined): string {
  const map: Record<string, string> = {
    MLA: "auth.mercadolibre.com.ar",
    MLM: "auth.mercadolibre.com.mx",
    MLB: "auth.mercadolivre.com.br",
    MLC: "auth.mercadolibre.cl",
    MCO: "auth.mercadolibre.com.co",
    MLU: "auth.mercadolibre.com.uy",
    MPE: "auth.mercadolibre.com.pe",
    MLV: "auth.mercadolibre.com.ve",
    MEC: "auth.mercadolibre.com.ec",
    MBO: "auth.mercadolibre.com.bo",
    MPY: "auth.mercadolibre.com.py",
    MCR: "auth.mercadolibre.com.cr",
    MPA: "auth.mercadolibre.com.pa",
    MRD: "auth.mercadolibre.com.do",
  };
  return map[(site ?? "").toUpperCase()] ?? "auth.mercadolibre.com.ar";
}

export interface MlCredentials {
  clientId?: string;
  clientSecret?: string;
  site: string;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  nickname?: string;
  /** epoch ms; 0 = desconocido. */
  expiresAt: number;
}

/** Lee el estado del canal desde settings (D1). Nunca truena. */
export async function loadMlCredentials(env: Env): Promise<MlCredentials> {
  let s: Record<string, string> = {};
  try {
    s = await new SettingsRepo(new Db(env.DB)).all();
  } catch {
    /* sin DB → todo vacío */
  }
  const pick = (k: string): string | undefined => {
    const v = s[k];
    return v !== undefined && v.trim() !== "" ? v.trim() : undefined;
  };
  return {
    clientId: pick(SETTING_KEYS.mlClientId),
    clientSecret: pick(SETTING_KEYS.mlClientSecret),
    site: pick(SETTING_KEYS.mlSite) ?? "MLA",
    accessToken: pick(SETTING_KEYS.mlAccessToken),
    refreshToken: pick(SETTING_KEYS.mlRefreshToken),
    userId: pick(SETTING_KEYS.mlUserId),
    nickname: pick(SETTING_KEYS.mlNickname),
    expiresAt: Number(pick(SETTING_KEYS.mlTokenExpiresAt) ?? 0) || 0,
  };
}

/** ¿El canal está listo para responder? (app + tokens + vendedor). */
export function mlConnected(c: MlCredentials): boolean {
  return Boolean(c.accessToken && c.refreshToken && c.userId);
}

/** URL del login de MercadoLibre para que el vendedor autorice la app. */
export function mlAuthorizeUrl(
  creds: MlCredentials,
  redirectUri: string,
  state: string,
): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: creds.clientId ?? "",
    redirect_uri: redirectUri,
    state,
  });
  return `https://${mlAuthDomain(creds.site)}/authorization?${p.toString()}`;
}

interface MlTokenResponse {
  access_token?: string;
  refresh_token?: string;
  user_id?: number | string;
  expires_in?: number;
  message?: string;
  error?: string;
}

async function persistTokens(env: Env, json: MlTokenResponse): Promise<void> {
  const repo = new SettingsRepo(new Db(env.DB));
  if (json.access_token) await repo.set(SETTING_KEYS.mlAccessToken, String(json.access_token));
  if (json.refresh_token) await repo.set(SETTING_KEYS.mlRefreshToken, String(json.refresh_token));
  if (json.user_id != null) await repo.set(SETTING_KEYS.mlUserId, String(json.user_id));
  const ttlMs = (Number(json.expires_in) || 21600) * 1000;
  await repo.set(SETTING_KEYS.mlTokenExpiresAt, String(Date.now() + ttlMs));
}

/** Intercambia el `code` del OAuth por tokens y los guarda. */
export async function exchangeMlCode(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const creds = await loadMlCredentials(env);
  if (!creds.clientId || !creds.clientSecret) {
    return { ok: false, error: "Faltan el App ID y la Secret Key de MercadoLibre." };
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  let json: MlTokenResponse;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(10000),
    });
    json = (await res.json().catch(() => ({}))) as MlTokenResponse;
    if (!res.ok || !json.access_token) {
      return {
        ok: false,
        error: `MercadoLibre rechazó la autorización (HTTP ${res.status}). ${json.message ?? json.error ?? ""}`.trim(),
      };
    }
  } catch {
    return { ok: false, error: "No se pudo contactar a MercadoLibre para completar la autorización." };
  }
  await persistTokens(env, json);
  // Nombre visible del vendedor (solo para mostrarlo en el panel).
  try {
    const me = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${json.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (me.ok) {
      const mj = (await me.json()) as { nickname?: string };
      if (mj?.nickname) {
        await new SettingsRepo(new Db(env.DB)).set(SETTING_KEYS.mlNickname, String(mj.nickname));
      }
    }
  } catch {
    /* opcional */
  }
  return { ok: true };
}

/**
 * Devuelve un access token vigente, refrescándolo si le quedan <10 min.
 * Persiste el refresh token rotado. `null` si el canal no está conectado o el
 * refresh falló sin remedio.
 */
export async function getMlAccessToken(
  env: Env,
): Promise<{ token: string; userId: string; site: string } | null> {
  const creds = await loadMlCredentials(env);
  if (!creds.refreshToken || !creds.userId || !creds.clientId || !creds.clientSecret) return null;

  if (creds.accessToken && creds.expiresAt - Date.now() > 10 * 60_000) {
    return { token: creds.accessToken, userId: creds.userId, site: creds.site };
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
  });
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({}))) as MlTokenResponse;
    if (!res.ok || !json.access_token) {
      console.error(`[mercadolibre] refresh token falló: HTTP ${res.status} ${json.message ?? ""}`);
      // Otra petición pudo haber refrescado en paralelo (el refresh token es de
      // un solo uso): re-leemos y usamos el token fresco si quedó vigente.
      const fresh = await loadMlCredentials(env);
      if (fresh.accessToken && fresh.userId && fresh.expiresAt - Date.now() > 60_000) {
        return { token: fresh.accessToken, userId: fresh.userId, site: fresh.site };
      }
      return null;
    }
    await persistTokens(env, json);
    return {
      token: String(json.access_token),
      userId: String(json.user_id ?? creds.userId),
      site: creds.site,
    };
  } catch (e) {
    console.error("[mercadolibre] refresh token error:", e);
    return null;
  }
}

/** Borra los tokens (desconectar), conservando App ID / Secret / país. */
export async function clearMlTokens(env: Env): Promise<void> {
  const repo = new SettingsRepo(new Db(env.DB));
  for (const k of [
    SETTING_KEYS.mlAccessToken,
    SETTING_KEYS.mlRefreshToken,
    SETTING_KEYS.mlUserId,
    SETTING_KEYS.mlNickname,
    SETTING_KEYS.mlTokenExpiresAt,
    SETTING_KEYS.mlOauthState,
  ]) {
    await repo.set(k, "");
  }
}
