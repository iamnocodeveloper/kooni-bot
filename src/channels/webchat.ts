import type { ChannelAdapter, IncomingMessage, OutgoingReply } from "./shared";
import type { Env } from "../env";

/**
 * Chat del SITIO WEB: burbuja embebible en la página del negocio. El visitante
 * escribe en el widget (`GET /chat.js`), que hace POST a `/webhooks/webchat` y
 * luego lee las respuestas del bot. Es el canal más simple: sin tokens ni
 * verificación. La sesión la genera el navegador (un id random por visitante).
 *
 * El envío es un NO-OP: el agente guarda la respuesta en D1 y el widget la
 * levanta por polling (`GET /webhooks/webchat/:session/messages`). No hay push.
 */
export const webchatAdapter: ChannelAdapter = {
  async parseIncoming(request: Request, _env: Env): Promise<IncomingMessage> {
    const body = (await request.json().catch(() => null)) as any;
    const session = String(body?.session ?? "").trim();
    const text = String(body?.text ?? "").trim();
    if (!session || !text) throw new Error("webchat: falta session o text");
    return {
      channel: "webchat",
      channelUserId: session,
      displayName: typeof body?.name === "string" ? body.name.trim() || undefined : undefined,
      text,
      receivedAt: Date.now(),
      rawPayload: body,
    };
  },

  async sendReply(_reply: OutgoingReply, _env: Env): Promise<void> {
    // El widget lee la respuesta por polling — nada que empujar.
  },

  async showTyping(_channelUserId: string, _env: Env): Promise<void> {
    // No-op: el widget muestra "escribiendo…" por su cuenta.
  },
};
