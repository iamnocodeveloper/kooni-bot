import { Db } from "./client";

/** Un contacto bloqueado al bot (silencio total). */
export interface ContactBlock {
  channel: string;
  channelUserId: string;
  displayName: string | null;
  reason: string | null;
  createdBy: string;
  createdAt: number;
}

interface ContactBlockRow {
  channel: string;
  channel_user_id: string;
  display_name: string | null;
  reason: string | null;
  created_by: string;
  created_at: number;
}

function rowToBlock(row: ContactBlockRow): ContactBlock {
  return {
    channel: row.channel,
    channelUserId: row.channel_user_id,
    displayName: row.display_name,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export class ContactBlocksRepo {
  constructor(private readonly db: Db) {}

  async isBlocked(channel: string, channelUserId: string): Promise<boolean> {
    const row = await this.db.first<{ n: number }>(
      "SELECT 1 AS n FROM contact_blocks WHERE channel = ? AND channel_user_id = ?",
      [channel, channelUserId],
    );
    return !!row;
  }

  /** Crea el bloqueo (idempotente: re-bloquear actualiza motivo/nombre). */
  async block(input: {
    channel: string;
    channelUserId: string;
    displayName?: string | null;
    reason?: string | null;
    createdBy?: string;
    at?: number;
  }): Promise<void> {
    const now = input.at ?? Date.now();
    await this.db.run(
      `INSERT INTO contact_blocks (channel, channel_user_id, display_name, reason, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel, channel_user_id) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, contact_blocks.display_name),
         reason = COALESCE(excluded.reason, contact_blocks.reason)`,
      [
        input.channel,
        input.channelUserId,
        input.displayName?.trim() || null,
        input.reason?.trim() || null,
        input.createdBy ?? "panel",
        now,
      ],
    );
  }

  async unblock(channel: string, channelUserId: string): Promise<void> {
    await this.db.run(
      "DELETE FROM contact_blocks WHERE channel = ? AND channel_user_id = ?",
      [channel, channelUserId],
    );
  }

  async list(limit = 500): Promise<ContactBlock[]> {
    const rows = await this.db.all<ContactBlockRow>(
      "SELECT * FROM contact_blocks ORDER BY created_at DESC LIMIT ?",
      [limit],
    );
    return rows.map(rowToBlock);
  }
}
