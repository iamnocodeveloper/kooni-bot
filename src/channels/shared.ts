export type ChannelId = "manychat" | "telegram" | "twilio" | "messenger" | "instagram" | "whatsapp" | "zernio" | "waha" | "mercadolibre";

export interface IncomingMessage {
  channel: ChannelId;
  channelUserId: string;
  displayName?: string;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  isOwnerMessage?: boolean;
  /**
   * El negocio respondió al cliente DESDE FUERA del panel (app nativa de
   * Instagram/Messenger/WhatsApp, u otra herramienta). No es un mensaje para
   * que el bot conteste: se registra en el hilo como `owner` y pausa el bot
   * (takeover). El webhook lo enruta con `recordOwnerEcho`, no con `ingest`.
   */
  ownerEcho?: boolean;
  receivedAt: number;
  rawPayload: unknown;
  /** Para responder en el hilo del mensaje entrante (Telegram grupos). */
  replyToMessageId?: number;
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
  /** Para responder EN el hilo (Telegram grupos): message_id del mensaje entrante. */
  replyToMessageId?: number;
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
  waha: { buttons: false, image: true, audio: true },
  // MercadoLibre: preguntas y mensajería post-venta son texto plano. Sin
  // botones ni adjuntos por esta vía.
  mercadolibre: { buttons: false, image: false, audio: false },
};

export interface ChannelAdapter {
  parseIncoming(request: Request, env: any): Promise<IncomingMessage>;
  sendReply(reply: OutgoingReply, env: any): Promise<void>;
  showTyping?(channelUserId: string, env: any): Promise<void>;
}
