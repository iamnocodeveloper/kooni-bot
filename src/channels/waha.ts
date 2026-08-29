/**
 * WAHA (WhatsApp HTTP API) — canal WhatsApp self-hosted.
 *
 * WAHA es un servidor (Docker, https://waha.dev) que conecta una cuenta de
 * WhatsApp por QR y expone una API HTTP + webhooks. Este adaptador hace de
 * puente: los mensajes entrantes llegan por webhook al worker y las respuestas
 * del bot salen por POST /api/sendText (o /api/sendFile para media).
 *
 * ACTIVACIÓN POR INSTALACIÓN: el canal SOLO está activo si la instalación
 * define WAHA_API_URL. Sin esa var, /webhooks/waha devuelve 401 y el canal no
 * procesa nada — el resto de instalaciones no se ven afectadas.
 *
 * Formato del webhook (WAHA v3, evento "message"):
 *   { "event": "message", "session": "default",
 *     "payload": { "id": "...", "chatId": "593...@c.us", "fromMe": false,
 *                  "text": "hola", "media": { "mimetype": "image/jpeg", "url": "..." } } }
 * chatId puede ser "…@c.us" (persona) o "…@g.us" (grupo).
 */
import type { ChannelAdapter, IncomingMessage, OutgoingReply } from "./shared";
import type { Env } from "../env";

const DEFAULT_SESSION = "default";

interface WahaConfig {
  base: string;
  session: string;
  apiKey?: string;
}

export function wahaConfig(env: Env): WahaConfig {
  return {
    base: (env.WAHA_API_URL ?? "").trim().replace(/\/+$/, ""),
    session: env.WAHA_SESSION?.trim() || DEFAULT_SESSION,
    apiKey: env.WAHA_API_KEY?.trim() || undefined,
  };
}

function headers(cfg: WahaConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : {}),
  };
}

/**
 * ¿El webhook es válido? Fail-closed: sin WAHA_API_URL el canal está apagado;
 * con WAHA_WEBHOOK_TOKEN configurado, exige que la URL traiga ?token=...
 */
export async function verifyWahaWebhook(request: Request, env: Env): Promise<boolean> {
  if (!wahaConfig(env).base) return false; // canal no configurado en esta instalación
  const token = env.WAHA_WEBHOOK_TOKEN?.trim();
  if (!token) return true; // sin secret configurado, no hay nada que validar
  try {
    return new URL(request.url).searchParams.get("token") === token;
  } catch {
    return false;
  }
}

export const wahaAdapter: ChannelAdapter = {
  async parseIncoming(request: Request, env: Env): Promise<IncomingMessage> {
    const body = (await request.json().catch(() => null)) as any;
    const event = body?.event;
    const payload = body?.payload ?? {};
    // Solo mensajes ENTRANTES de usuarios (no ecos propios ni acks).
    if (event !== "message" || payload.fromMe === true) {
      throw new Error("not an incoming waha message");
    }
    const chatId = String(payload.chatId ?? "").trim();
    if (!chatId) throw new Error("waha message without chatId");

    let text = typeof payload.text === "string" ? payload.text : undefined;
    let imageUrl: string | undefined;
    let audioUrl: string | undefined;
    const media = payload.media;
    if (media && typeof media.url === "string" && media.url) {
      const mime = String(media.mimetype ?? "").toLowerCase();
      if (/^image\//.test(mime)) imageUrl = media.url;
      else if (/^(audio|video)\//.test(mime) || /\.(ogg|mp3|m4a|amr|opus)(\?|#|$)/i.test(media.url)) {
        audioUrl = media.url;
      }
    }

    return {
      channel: "waha",
      channelUserId: chatId,
      text,
      imageUrl,
      audioUrl,
      receivedAt: Date.now(),
      rawPayload: body,
    };
  },

  async sendReply(reply: OutgoingReply, env: Env): Promise<void> {
    const cfg = wahaConfig(env);
    if (!cfg.base) throw new Error("WAHA_API_URL not set");
    const h = headers(cfg);
    const chatId = reply.channelUserId;

    const first = reply.chunks[0] ?? "";
    const rest = reply.chunks.slice(1);

    if (reply.imageUrl) {
      await fetch(`${cfg.base}/api/sendFile`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ session: cfg.session, chatId, file: { url: reply.imageUrl }, caption: first.slice(0, 1024) || undefined }),
      }).catch((e) => console.error("waha sendFile error:", e));
    } else if (reply.audioUrl) {
      await fetch(`${cfg.base}/api/sendFile`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ session: cfg.session, chatId, file: { url: reply.audioUrl }, caption: undefined }),
      }).catch((e) => console.error("waha sendFile error:", e));
    }

    const textChunks = reply.imageUrl || reply.audioUrl ? rest : reply.chunks;
    for (const chunk of textChunks) {
      const res = await fetch(`${cfg.base}/api/sendText`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ session: cfg.session, chatId, text: chunk }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`waha sendText falló: ${res.status} ${detail.slice(0, 200)}`);
      }
    }
  },

  async showTyping(_channelUserId: string, _env: Env): Promise<void> {
    // WAHA core no expone typing de forma fiable — no-op.
  },
};
