import { Db } from "./client";

// entrada = comunicación de entrada (una conversación que llegó pero el bot
// todavía no le sacó una intención). new..lost = el pipeline de siempre.
export type LeadStatus = "entrada" | "new" | "contacted" | "sold" | "lost";
export const LEAD_STATUSES: readonly LeadStatus[] = ["entrada", "new", "contacted", "sold", "lost"];

export interface Lead {
  id: string;
  conversation_id: string | null;
  name: string | null;
  contact: string | null;
  channel_user_id: string | null;
  intent: string;
  notes: string | null;
  status: LeadStatus;
  exported_to: string | null;
  external_id: string | null;
  /** JSON con los campos propios del nicho (o null). Ver leadMetadata(). */
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateLeadInput {
  conversationId: string | null;
  channelUserId: string | null;
  name?: string;
  contact?: string;
  intent: string;
  notes?: string;
  /** Campos propios del nicho; se serializan a JSON en la columna metadata. */
  metadata?: Record<string, string | number | null>;
}

/** Parsea el JSON de metadata de un lead a un objeto plano (vacío si no hay/está roto). */
export function leadMetadata(lead: Pick<Lead, "metadata">): Record<string, string> {
  if (!lead.metadata) return {};
  try {
    const o = JSON.parse(lead.metadata);
    if (!o || typeof o !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v !== null && v !== undefined) out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

export class LeadsRepo {
  constructor(private readonly db: Db) {}

  async create(input: CreateLeadInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const metadata =
      input.metadata && Object.keys(input.metadata).length > 0
        ? JSON.stringify(input.metadata)
        : null;
    await this.db.run(
      `INSERT INTO leads (id, conversation_id, name, contact, channel_user_id, intent, notes, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.conversationId,
        input.name ?? null,
        input.contact ?? null,
        input.channelUserId,
        input.intent,
        input.notes ?? null,
        metadata,
        now,
        now,
      ],
    );
    return id;
  }

  async list(limit: number, status?: string): Promise<Lead[]> {
    if (status) {
      return this.db.all<Lead>(
        "SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC LIMIT ?",
        [status, limit],
      );
    }
    return this.db.all<Lead>(
      "SELECT * FROM leads ORDER BY created_at DESC LIMIT ?",
      [limit],
    );
  }

  /** El lead ligado a una conversación (para dar continuidad al bot). */
  async byConversation(conversationId: string): Promise<Lead | null> {
    return this.db.first<Lead>(
      "SELECT * FROM leads WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
      [conversationId],
    );
  }

  /**
   * Si la conversación todavía no tiene lead, crea uno en estado `entrada`
   * (comunicación de entrada, sin clasificar). Devuelve el lead existente o el
   * nuevo. Idempotente: nunca crea un segundo lead para la misma conversación.
   */
  async ensureEntrada(conversationId: string): Promise<Lead> {
    const existing = await this.byConversation(conversationId);
    if (existing) return existing;
    // Datos de contacto: de la propia conversación.
    const conv = await this.db.first<{ display_name: string | null; channel_user_id: string | null }>(
      "SELECT display_name, channel_user_id FROM conversations WHERE id = ?",
      [conversationId],
    );
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO leads (id, conversation_id, name, contact, channel_user_id, intent, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'entrada', ?, ?)`,
      [
        id,
        conversationId,
        conv?.display_name ?? null,
        conv?.channel_user_id ?? null,
        conv?.channel_user_id ?? null,
        "(comunicación de entrada — sin clasificar)",
        now,
        now,
      ],
    );
    return (await this.byConversation(conversationId))!;
  }

  async setStatus(id: string, status: LeadStatus, note?: string): Promise<void> {
    if (note && note.trim()) {
      const cur = await this.db.first<{ notes: string | null }>("SELECT notes FROM leads WHERE id = ?", [id]);
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const merged = `${cur?.notes ? cur.notes + "\n" : ""}[${stamp}] ${note.trim()}`;
      await this.db.run(
        "UPDATE leads SET status = ?, notes = ?, updated_at = ? WHERE id = ?",
        [status, merged, Date.now(), id],
      );
      return;
    }
    await this.db.run(
      "UPDATE leads SET status = ?, updated_at = ? WHERE id = ?",
      [status, Date.now(), id],
    );
  }

  async setExported(id: string, target: string, externalId: string): Promise<void> {
    await this.db.run(
      "UPDATE leads SET exported_to = ?, external_id = ?, updated_at = ? WHERE id = ?",
      [target, externalId, Date.now(), id],
    );
  }
}
