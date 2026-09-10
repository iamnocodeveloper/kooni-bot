import type { ChannelAdapter, ChannelId, OutgoingReply, ReplyButton } from "../channels/shared";
import { CHANNEL_CAPABILITIES } from "../channels/shared";
import type { Env } from "../env";
import { telegramAdapter } from "../channels/telegram";
import { manychatAdapter } from "../channels/manychat";
import { twilioAdapter } from "../channels/twilio";
import { metaAdapter } from "../channels/meta";
import { whatsappAdapter } from "../channels/whatsapp";
import { zernioAdapter } from "../channels/zernio";
import { wahaAdapter } from "../channels/waha";
import { mercadolibreAdapter } from "../channels/mercadolibre";
import { toPlainLinks } from "./format";

const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 1500;
const MS_PER_CHAR = 30;

// Human-like inter-chunk delay: proportional to chunk length (~30ms/char),
// clamped to [800, 1500]ms so replies feel typed, not dumped.
export function chunkDelayMs(chunk: string): number {
  const proportional = chunk.length * MS_PER_CHAR;
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, proportional));
}

export async function sendChunkedReply(
  adapter: ChannelAdapter,
  channel: ChannelId,
  channelUserId: string,
  chunks: string[],
  env: Env,
  interChunkDelayMs?: number,
): Promise<void> {
  // Default to a human-like, length-proportional pause between chunks.
  const delay =
    interChunkDelayMs ??
    (chunks.length > 1 ? chunkDelayMs(chunks[0]) : undefined);
  await adapter.sendReply(
    { channel, channelUserId, chunks, interChunkDelayMs: delay },
    env,
  );
}

export function pickAdapter(channel: ChannelId): ChannelAdapter {
  return withPlainLinks(rawAdapter(channel));
}

/** Adaptador sin envolver (el registro real por canal). */
function rawAdapter(channel: ChannelId): ChannelAdapter {
  if (channel === "telegram") return telegramAdapter;
  if (channel === "manychat") return manychatAdapter;
  if (channel === "twilio") return twilioAdapter;
  if (channel === "whatsapp") return whatsappAdapter;
  if (channel === "messenger" || channel === "instagram") return metaAdapter;
  if (channel === "zernio") return zernioAdapter;
  if (channel === "waha") return wahaAdapter;
  if (channel === "mercadolibre") return mercadolibreAdapter;
  throw new Error(`unknown channel: ${channel}`);
}

/**
 * Normaliza los links salientes en TODOS los canales: los de mensajería
 * (WhatsApp, Instagram, Messenger, Telegram) NO renderizan Markdown, así que
 * `[texto](url)` llegaba literal y sin ser clickeable. `toPlainLinks` lo vuelve
 * `texto (url)` → la app detecta la URL y la hace clickeable sola. Es el punto
 * único por el que pasan todos los envíos (agente, tools, campañas, CRM),
 * incluido `sendReplyCapped`.
 */
function withPlainLinks(a: ChannelAdapter): ChannelAdapter {
  return {
    ...a,
    sendReply: (reply, env) =>
      a.sendReply({ ...reply, chunks: reply.chunks.map(toPlainLinks) }, env),
  };
}

/**
 * Envía una respuesta respetando las capacidades de cada canal (Fase A).
 * Si el canal NO soporta botones/imagen/audio, esos campos se descartan
 * (degradación con gracia) y el texto se envía igual. Devuelve qué se descartó.
 */
export async function sendReplyCapped(
  channel: ChannelId,
  channelUserId: string,
  chunks: string[],
  env: Env,
  opts: { buttons?: ReplyButton[]; imageUrl?: string; audioUrl?: string; interChunkDelayMs?: number } = {},
): Promise<{ dropped: string[] }> {
  const caps = CHANNEL_CAPABILITIES[channel] ?? { buttons: false, image: false, audio: false };
  const dropped: string[] = [];

  let buttons = opts.buttons;
  let imageUrl = opts.imageUrl;
  let audioUrl = opts.audioUrl;

  if (buttons && buttons.length && !caps.buttons) {
    dropped.push("buttons");
    buttons = undefined;
  }
  if (imageUrl && !caps.image) {
    dropped.push("image");
    imageUrl = undefined;
  }
  if (audioUrl && !caps.audio) {
    dropped.push("audio");
    audioUrl = undefined;
  }

  const adapter = pickAdapter(channel);
  await adapter.sendReply(
    {
      channel,
      channelUserId,
      chunks,
      interChunkDelayMs: opts.interChunkDelayMs,
      ...(buttons && buttons.length ? { buttons } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(audioUrl ? { audioUrl } : {}),
    },
    env,
  );
  return { dropped };
}
