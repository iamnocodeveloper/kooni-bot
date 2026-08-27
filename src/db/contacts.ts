import { Db } from "./client";

/** Contacto: TODOS los que interactúan (DM o comentario), separados de Leads. */
export interface Contact {
  id: string;
  channel: string;
  channelUserId: string;
  displayName?: string;
  username?: string;
  lastInteractionAt: number;
  firstSeenAt: number;
  interactionCount: number;
}

interface ContactRow {
  id: string;
  channel: string;
  channel_user_id: string;
  display_name: string | null;
  username: string | null;
  last_interaction_at: number;
  first_seen_at: number;
  interaction_count: number;
}

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    channel: row.channel,
    channelUserId: row.channel_user_id,
    displayName: row.display_name ?? undefined,
    username: row.username ?? undefined,
    lastInteractionAt: row.last_interaction_at,
    firstSeenAt: row.first_seen_at,
    interactionCount: row.interaction_count,
  };
}

export class ContactsRepo {
  constructor(private readonly db: Db) {}

  /** Registra una interacción de un usuario (crea o actualiza el contacto). */
  async touch(input: {
    channel: string;
    channelUserId: string;
    displayName?: string;
    username?: string;
    at?: number;
  }): Promise<void> {
    const now = input.at ?? Date.now();
    // id estable por canal+usuario (evita duplicados por race).
    const id = `${input.channel}:${input.channelUserId}`;
    await this.db.run(
      `INSERT INTO contacts (id, channel, channel_user_id, display_name, username, last_interaction_at, first_seen_at, interaction_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(channel, channel_user_id) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, contacts.display_name),
         username = COALESCE(excluded.username, contacts.username),
         last_interaction_at = MAX(contacts.last_interaction_at, excluded.last_interaction_at),
         interaction_count = contacts.interaction_count + 1`,
      [
        id,
        input.channel,
        input.channelUserId,
        input.displayName ?? null,
        input.username ?? null,
        now,
        now,
      ],
    );
  }

  /** Últimos contactos (para el panel). */
  async recent(limit = 200): Promise<Contact[]> {
    const rows = await this.db.all<ContactRow>(
      "SELECT * FROM contacts ORDER BY last_interaction_at DESC LIMIT ?",
      [limit],
    );
    return rows.map(rowToContact);
  }

  async count(): Promise<number> {
    const row = await this.db.first<{ n: number }>("SELECT COUNT(*) as n FROM contacts");
    return row?.n ?? 0;
  }
}
