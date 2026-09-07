// Proxy autenticado del panel para previsualizar media entrante en el hilo de
// conversaciones (§ V Fase 2, docs/PLAN.md). Vive detrás del mismo guard de
// `/admin/*` (routes.ts) — solo el dueño logueado llega hasta acá.
//
// El navegador del dueño NUNCA ve el token del bot de Telegram ni la API key
// de WAHA: este handler los usa server-side para pedir el archivo y solo
// devuelve los bytes de vuelta.
import type { Env } from "../env";
import { unmaskTelegramToken } from "../telegramFiles";
import { resolveTelegramToken } from "../channels/telegramCredentials";
import { resolveWahaConfig } from "../channels/wahaCredentials";

async function streamUpstream(url: string, headers: Record<string, string> = {}): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers });
  } catch {
    return new Response("media no disponible", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("media no disponible", { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      // Privado (auth del panel) y de corta duración: el archivo puede rotar
      // del lado del canal (ej. Telegram invalida file_id viejos algún día).
      "Cache-Control": "private, max-age=300",
    },
  });
}

/** Telegram: el marcador guardado trae el token enmascarado — se repone acá, nunca antes. */
export async function serveTelegramMedia(maskedUrl: string, env: Env): Promise<Response> {
  if (!maskedUrl) return new Response("falta el parámetro u", { status: 400 });
  const token = await resolveTelegramToken(env);
  if (!token) return new Response("sin token de Telegram configurado", { status: 404 });
  const url = unmaskTelegramToken(maskedUrl, token);
  if (url === maskedUrl) return new Response("referencia inválida", { status: 400 });
  return streamUpstream(url);
}

/**
 * WAHA (self-hosted): el archivo vive en el servidor propio del cliente,
 * protegido por su API key. Se valida que la URL pedida sea del MISMO host
 * configurado (`WAHA_API_URL`/settings) antes de hacer el fetch — si no, esta
 * ruta sería un proxy abierto (SSRF) que además pega la API key a cualquier
 * destino que alguien le pase en `?u=`.
 */
export async function serveWahaMedia(fileUrl: string, env: Env): Promise<Response> {
  if (!fileUrl) return new Response("falta el parámetro u", { status: 400 });
  const cfg = await resolveWahaConfig(env);
  if (!cfg.base) return new Response("WAHA no configurado", { status: 404 });
  if (fileUrl !== cfg.base && !fileUrl.startsWith(`${cfg.base}/`)) {
    return new Response("origen de media no permitido", { status: 400 });
  }
  return streamUpstream(fileUrl, cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : {});
}
