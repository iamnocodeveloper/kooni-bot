/**
 * Llamadas a la API de gestión de sesiones de WAHA (crear/actualizar/arrancar
 * sesión, estado, QR). Verificado contra su OpenAPI real
 * (https://waha.devlike.pro/swagger/openapi.json, 2026-09-04):
 *   - Auth: header `X-Api-Key` (mismo que ya usa `channels/waha.ts` para
 *     sendText/sendFile).
 *   - `GET  /api/sessions/{session}`        → estado (`status`: WORKING,
 *     SCAN_QR_CODE, STARTING, STOPPED, FAILED...).
 *   - `POST /api/sessions`                  → crea sesión (name, start,
 *     config.webhooks[]).
 *   - `PUT  /api/sessions/{session}`        → actualiza config (webhooks[]) de
 *     una sesión existente.
 *   - `POST /api/sessions/{session}/start`  → arranca la sesión.
 *   - `GET  /api/{session}/auth/qr?format=image` → PNG del QR para emparejar
 *     (requiere sesión en estado SCAN_QR_CODE).
 */
import type { WahaConfig } from "./wahaCredentials";

export interface WahaSessionInfo {
  status: string;
}

function headers(cfg: WahaConfig): Record<string, string> {
  return { "Content-Type": "application/json", ...(cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : {}) };
}

/** Estado actual de la sesión, o null si no se pudo consultar (sin config, sesión inexistente, red caída). */
export async function getWahaSessionStatus(cfg: WahaConfig): Promise<WahaSessionInfo | null> {
  if (!cfg.base || !cfg.apiKey) return null;
  try {
    const res = await fetch(`${cfg.base}/api/sessions/${encodeURIComponent(cfg.session)}`, {
      headers: headers(cfg),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { status?: string };
    return { status: j.status ?? "UNKNOWN" };
  } catch {
    return null;
  }
}

/**
 * Crea la sesión si no existe (con el webhook ya apuntando al worker y
 * `start: true`), o actualiza el webhook + arranca si ya existía. Idempotente:
 * se puede llamar cada vez que el dueño guarda la card de WAHA en el panel.
 */
export async function ensureWahaSession(
  cfg: WahaConfig,
  webhookUrl: string,
): Promise<{ ok: boolean; status?: number; message?: string }> {
  if (!cfg.base) return { ok: false, message: "Falta la URL del servidor de WAHA." };
  if (!cfg.apiKey) return { ok: false, message: "Falta la API key de WAHA." };
  const h = headers(cfg);
  const webhooks = [{ url: webhookUrl, events: ["message"] }];

  let existing: Response | null = null;
  try {
    existing = await fetch(`${cfg.base}/api/sessions/${encodeURIComponent(cfg.session)}`, {
      headers: h,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, message: "No se pudo contactar el servidor de WAHA." };
  }

  if (existing.ok) {
    let put: Response;
    try {
      put = await fetch(`${cfg.base}/api/sessions/${encodeURIComponent(cfg.session)}`, {
        method: "PUT",
        headers: h,
        body: JSON.stringify({ config: { webhooks } }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { ok: false, message: "No se pudo contactar el servidor de WAHA para actualizar la sesión." };
    }
    if (!put.ok) {
      return { ok: false, status: put.status, message: `WAHA respondió ${put.status} al actualizar la sesión.` };
    }
    await fetch(`${cfg.base}/api/sessions/${encodeURIComponent(cfg.session)}/start`, {
      method: "POST",
      headers: h,
      signal: AbortSignal.timeout(8000),
    }).catch(() => {}); // best-effort: si ya estaba corriendo, WAHA lo ignora
    return { ok: true };
  }

  let created: Response;
  try {
    created = await fetch(`${cfg.base}/api/sessions`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: cfg.session, start: true, config: { webhooks } }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, message: "No se pudo contactar el servidor de WAHA para crear la sesión." };
  }
  if (!created.ok) {
    const detail = await created.text().catch(() => "");
    return { ok: false, status: created.status, message: `WAHA respondió ${created.status} al crear la sesión. ${detail.slice(0, 200)}` };
  }
  return { ok: true };
}

/** Trae el PNG del QR desde WAHA (o null si falla) — para proxiar sin exponer la API key al navegador. */
export async function fetchWahaQrPng(cfg: WahaConfig): Promise<ArrayBuffer | null> {
  if (!cfg.base || !cfg.apiKey) return null;
  try {
    const res = await fetch(
      `${cfg.base}/api/${encodeURIComponent(cfg.session)}/auth/qr?format=image`,
      { headers: headers(cfg), signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}
