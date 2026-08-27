export type ChannelId = "manychat" | "telegram" | "twilio" | "messenger" | "instagram" | "whatsapp" | "zernio";

export interface IncomingMessage {
  channel: ChannelId;
  channelUserId: string;
  displayName?: string;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  isOwnerMessage?: boolean;
  receivedAt: number;
  rawPayload: unknown;
}

export interface OutgoingReply {
  channel: ChannelId;
  channelUserId: string;
  chunks: string[];
  interChunkDelayMs?: number;
  /** Botones (inline keyboard / buttons) — solo se envían si el canal lo soporta. */
  buttons?: ReplyButton[];
  /** URL de imagen para adjuntar al primer chunk (si el canal lo soporta). */
  imageUrl?: string;
  /** URL de audio para adjuntar (si el canal lo soporta). */
  audioUrl?: string;
}

/** Botón de respuesta (Telegram inline_keyboard / Zernio buttons / etc.). */
export interface ReplyButton {
  text: string;         // etiqueta visible
  url?: string;         // botón de link (url)
  callback?: string;    // payload interno (callback_data / postback)
}

/** Qué soporta cada canal para el envío (para degradar con gracia). */
export const CHANNEL_CAPABILITIES: Record<ChannelId, { buttons: boolean; image: boolean; audio: boolean }> = {
  telegram: { buttons: true, image: true, audio: true },
  zernio: { buttons: true, image: true, audio: true },
  manychat: { buttons: true, image: true, audio: false },
  twilio: { buttons: false, image: true, audio: true },
  whatsapp: { buttons: true, image: true, audio: true },
  messenger: { buttons: true, image: true, audio: true },
  instagram: { buttons: true, image: true, audio: true },
};

export interface ChannelAdapter {
  parseIncoming(request: Request, env: any): Promise<IncomingMessage>;
  sendReply(reply: OutgoingReply, env: any): Promise<void>;
  showTyping?(channelUserId: string, env: any): Promise<void>;
}
