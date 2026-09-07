import { Db } from "./client";

export type MessageRole = "user" | "assistant" | "tool" | "owner";

/** Botón adjunto a una respuesta (§ V Fase 3) — ver `message_buttons` en schema.sql. */
export interface MessageButton {
  label: string;
  kind: "url" | "callback";
  value: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tool_calls: string | null;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  audio_seconds: number | null;
  image_count: number | null;
  created_at: number;
}

export interface AppendOptions {
  toolCalls?: unknown[];
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  audioSeconds?: number;
  imageCount?: number;
  createdAt?: number;
}

export class MessagesRepo {
  constructor(private readonly db: Db) {}

  async append(
    conversationId: string,
    role: MessageRole,
    content: string,
    opts: AppendOptions = {},
  ): Promise<string> {
    const id = crypto.randomUUID();
    const createdAt = opts.createdAt ?? Date.now();
    await this.db.run(
      `INSERT INTO messages (
        id, conversation_id, role, content, tool_calls, model_used,
        input_tokens, output_tokens, cached_input_tokens,
        audio_seconds, image_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        conversationId,
        role,
        content,
        opts.toolCalls ? JSON.stringify(opts.toolCalls) : null,
        opts.modelUsed ?? null,
        opts.inputTokens ?? null,
        opts.outputTokens ?? null,
        opts.cachedInputTokens ?? null,
        opts.audioSeconds ?? null,
        opts.imageCount ?? null,
        createdAt,
      ],
    );
    return id;
  }

  /** Guarda los botones que se adjuntaron a una respuesta (§ V Fase 3). */
  async saveButtons(
    messageId: string,
    buttons: { text: string; url?: string; callback?: string }[],
  ): Promise<void> {
    for (const [idx, b] of buttons.entries()) {
      await this.db.run(
        `INSERT INTO message_buttons (id, message_id, idx, label, kind, value) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          messageId,
          idx,
          b.text,
          b.url ? "url" : "callback",
          b.url ?? b.callback ?? null,
        ],
      );
    }
  }

  /** Botones de varios mensajes de una sola pasada (evita N+1 al pintar el hilo). */
  async buttonsForMessages(messageIds: string[]): Promise<Map<string, MessageButton[]>> {
    const byMessage = new Map<string, MessageButton[]>();
    if (messageIds.length === 0) return byMessage;
    const placeholders = messageIds.map(() => "?").join(",");
    const rows = await this.db.all<{ message_id: string; label: string; kind: "url" | "callback"; value: string | null }>(
      `SELECT message_id, label, kind, value FROM message_buttons WHERE message_id IN (${placeholders}) ORDER BY idx ASC`,
      messageIds,
    );
    for (const r of rows) {
      if (!byMessage.has(r.message_id)) byMessage.set(r.message_id, []);
      byMessage.get(r.message_id)!.push({ label: r.label, kind: r.kind, value: r.value });
    }
    return byMessage;
  }

  async lastN(conversationId: string, n: number): Promise<Message[]> {
    const rows = await this.db.all<Message>(
      `SELECT * FROM (
         SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT ?
       ) ORDER BY created_at ASC`,
      [conversationId, n],
    );
    return rows;
  }

  async purgeOlderThan(cutoffMs: number): Promise<number> {
    const res = await this.db.run(
      "DELETE FROM messages WHERE created_at < ?",
      [cutoffMs],
    );
    return res.meta.changes ?? 0;
  }
}
