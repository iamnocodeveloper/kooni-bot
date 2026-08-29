import type { ChannelAdapter, IncomingMessage, OutgoingReply } from "./shared";
import type { Env } from "../env";
import { resolveTelegramToken } from "./telegramCredentials";

const TG_API = "https://api.telegram.org/bot";

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name?: string; is_bot: boolean };
    chat: { id: number; type: string };
    date: number;
    text?: string;
    caption?: string;
    voice?: { file_id: string; duration: number };
    photo?: { file_id: string; width: number; height: number }[];
  };
}

export async function resolveTelegramFileUrl(
  fileId: string,
  token: string,
): Promise<string | null> {
  // Telegram files are NOT directly addressable by file_id. You must call
  // getFile to obtain a file_path, then download from
  // https://api.telegram.org/file/bot<token>/<file_path> (per Bot API docs).
  const res = await fetch(`${TG_API}${token}/getFile?file_id=${fileId}`);
  if (!res.ok) return null;
  const json: any = await res.json();
  if (!json?.ok) return null;
  return `https://api.telegram.org/file/bot${token}/${json.result.file_path}`;
}

export const telegramAdapter: ChannelAdapter = {
  async parseIncoming(request: Request, env: Env): Promise<IncomingMessage> {
    const update = (await request.json()) as TgUpdate;
    const msg = update.message;
    if (!msg) throw new Error("not a message update");
    // Grupos: ignoramos mensajes de OTROS bots (evita loops bot↔bot).
    if (msg.from?.is_bot) throw new Error("message from another bot — ignored");
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
    // channelUserId = id del chat al que responder:
    //   privado → id del usuario (como antes)
    //   grupo   → "g" + id del grupo (negativo en supergrupos)
    const channelUserId = isGroup ? `g${msg.chat.id}` : String(msg.from.id);
    const displayName = msg.from.first_name;
    let text = msg.text;
    let audioUrl: string | undefined;
    let imageUrl: string | undefined;
    const token = (await resolveTelegramToken(env)) ?? "";
    if (msg.voice) {
      // Resolve to a real, fetchable HTTPS URL via getFile (see docs above).
      audioUrl = (await resolveTelegramFileUrl(msg.voice.file_id, token)) ?? undefined;
    } else if (msg.photo) {
      const largest = msg.photo[msg.photo.length - 1];
      imageUrl = (await resolveTelegramFileUrl(largest.file_id, token)) ?? undefined;
      text = msg.caption;
    }
    return {
      channel: "telegram",
      channelUserId,
      displayName,
      text,
      audioUrl,
      imageUrl,
      // The owner intervenes from their own Telegram account: detect by matching
      // the sender against OWNER_TELEGRAM_CHAT_ID (the same id used for handoff DMs).
      isOwnerMessage:
        !isGroup &&
        env.OWNER_TELEGRAM_CHAT_ID != null &&
        channelUserId === String(env.OWNER_TELEGRAM_CHAT_ID),
      // En grupos, la respuesta va EN el hilo de ese mensaje.
      replyToMessageId: isGroup ? msg.message_id : undefined,
      receivedAt: Date.now(),
      rawPayload: update,
    };
  },

  async sendReply(reply: OutgoingReply, env: Env): Promise<void> {
    const token = await resolveTelegramToken(env);
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

    // Grupo → chat_id real ("g" + id) y respondemos en el hilo del mensaje.
    const isGroup = reply.channelUserId.startsWith("g");
    const chatId = isGroup ? reply.channelUserId.slice(1) : reply.channelUserId;
    const replyToMessageId = isGroup ? reply.replyToMessageId : undefined;
    // Teclado inline (botones) — se adjunta al ÚLTIMO chunk de texto.
    const replyMarkup =
      reply.buttons && reply.buttons.length > 0
        ? {
            inline_keyboard: [
              reply.buttons.map((b) => ({
                text: b.text,
                ...(b.url ? { url: b.url } : {}),
                ...(b.callback ? { callback_data: b.callback } : {}),
              })),
            ],
          }
        : undefined;

    // Adjunto multimedia (imagen/audio): se manda ANTES del texto (primer chunk
    // como caption). Telegram los soporta; si la URL falla, se degrada a texto.
    const first = reply.chunks[0] ?? "";
    const rest = reply.chunks.slice(1);

    if (reply.imageUrl) {
      await fetch(`${TG_API}${token}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: reply.imageUrl,
          caption: first.slice(0, 1024) || undefined,
          ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      }).catch((e) => console.error("telegram sendPhoto error:", e));
    } else if (reply.audioUrl) {
      await fetch(`${TG_API}${token}/sendVoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          voice: reply.audioUrl,
          caption: first.slice(0, 1024) || undefined,
          ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      }).catch((e) => console.error("telegram sendVoice error:", e));
    }

    const textChunks = reply.imageUrl || reply.audioUrl ? rest : reply.chunks;
    for (let i = 0; i < textChunks.length; i++) {
      await fetch(`${TG_API}${token}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" }),
      }).catch(() => {});
      const delay = i === 0 ? 0 : reply.interChunkDelayMs ?? 1000;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const isLast = i === textChunks.length - 1 && !reply.imageUrl && !reply.audioUrl;
      await fetch(`${TG_API}${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: textChunks[i],
          ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
          ...(isLast && replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      });
    }
  },

  async showTyping(channelUserId: string, env: Env): Promise<void> {
    const token = await resolveTelegramToken(env);
    if (!token) return;
    await fetch(`${TG_API}${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelUserId.startsWith("g") ? channelUserId.slice(1) : channelUserId, action: "typing" }),
    }).catch(() => {});
  },
};
