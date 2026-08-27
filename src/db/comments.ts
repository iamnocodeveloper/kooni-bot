import { Db } from "./client";

/** Comentario recibido (pestaña "Comentarios" del panel, como Zernio). */
export interface CommentRecord {
  id: string;
  postId?: string;
  platformPostId?: string;
  text?: string;
  authorUsername?: string;
  authorName?: string;
  authorId?: string;
  platform: string;
  accountId?: string;
  ruleId?: string;
  dmSent: boolean;
  publicReplySent: boolean;
  publicReplyText?: string;
  createdAt: number;
}

interface CommentRow {
  id: string;
  post_id: string | null;
  platform_post_id: string | null;
  text: string | null;
  author_username: string | null;
  author_name: string | null;
  author_id: string | null;
  platform: string;
  account_id: string | null;
  rule_id: string | null;
  dm_sent: number;
  public_reply_sent: number;
  public_reply_text: string | null;
  created_at: number;
}

function rowToComment(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    postId: row.post_id ?? undefined,
    platformPostId: row.platform_post_id ?? undefined,
    text: row.text ?? undefined,
    authorUsername: row.author_username ?? undefined,
    authorName: row.author_name ?? undefined,
    authorId: row.author_id ?? undefined,
    platform: row.platform,
    accountId: row.account_id ?? undefined,
    ruleId: row.rule_id ?? undefined,
    dmSent: row.dm_sent === 1,
    publicReplySent: row.public_reply_sent === 1,
    publicReplyText: row.public_reply_text ?? undefined,
    createdAt: row.created_at,
  };
}

export class CommentsRepo {
  constructor(private readonly db: Db) {}

  /** Guarda (o actualiza) un comentario — upsert por id (commentId de Zernio). */
  async upsert(input: {
    id: string;
    postId?: string;
    platformPostId?: string;
    text?: string;
    authorUsername?: string;
    authorName?: string;
    authorId?: string;
    platform?: string;
    accountId?: string;
    ruleId?: string;
    dmSent?: boolean;
    publicReplySent?: boolean;
    publicReplyText?: string;
    createdAt?: number;
  }): Promise<void> {
    const now = input.createdAt ?? Date.now();
    await this.db.run(
      `INSERT INTO comments (id, post_id, platform_post_id, text, author_username, author_name, author_id, platform, account_id, rule_id, dm_sent, public_reply_sent, public_reply_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         text = COALESCE(excluded.text, comments.text),
         post_id = COALESCE(excluded.post_id, comments.post_id),
         platform_post_id = COALESCE(excluded.platform_post_id, comments.platform_post_id),
         author_username = COALESCE(excluded.author_username, comments.author_username),
         author_name = COALESCE(excluded.author_name, comments.author_name),
         author_id = COALESCE(excluded.author_id, comments.author_id),
         rule_id = COALESCE(excluded.rule_id, comments.rule_id),
         dm_sent = MAX(comments.dm_sent, excluded.dm_sent),
         public_reply_sent = MAX(comments.public_reply_sent, excluded.public_reply_sent),
         public_reply_text = COALESCE(excluded.public_reply_text, comments.public_reply_text)`,
      [
        input.id,
        input.postId ?? null,
        input.platformPostId ?? null,
        input.text ?? null,
        input.authorUsername ?? null,
        input.authorName ?? null,
        input.authorId ?? null,
        input.platform ?? "instagram",
        input.accountId ?? null,
        input.ruleId ?? null,
        input.dmSent ? 1 : 0,
        input.publicReplySent ? 1 : 0,
        input.publicReplyText ?? null,
        now,
      ],
    );
  }

  /** Últimos comentarios (para el panel). */
  async recent(limit = 100): Promise<CommentRecord[]> {
    const rows = await this.db.all<CommentRow>(
      "SELECT * FROM comments ORDER BY created_at DESC LIMIT ?",
      [limit],
    );
    return rows.map(rowToComment);
  }

  async count(): Promise<number> {
    const row = await this.db.first<{ n: number }>("SELECT COUNT(*) as n FROM comments");
    return row?.n ?? 0;
  }

  async remove(id: string): Promise<void> {
    await this.db.run("DELETE FROM comments WHERE id = ?", [id]);
  }
}
