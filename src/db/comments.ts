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

/** En qué entró el comentario: regla, fallback público, o nada. */
export type CommentRuleFilter = "matched" | "fallback" | "none";
/** Pata de salida del comentario. */
export type CommentLegFilter = "dm" | "public";

export interface CommentListFilters {
  search?: string;
  platform?: string;
  rule?: CommentRuleFilter;
  leg?: CommentLegFilter;
  days?: number;
  limit?: number;
  offset?: number;
}

export interface CommentCounts {
  total: number;
  matched: number;
  fallback: number;
  none: number;
  dm: number;
  publicReply: number;
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

  async getById(id: string): Promise<CommentRecord | null> {
    const row = await this.db.first<CommentRow>("SELECT * FROM comments WHERE id = ?", [id]);
    return row ? rowToComment(row) : null;
  }

  /**
   * Lista filtrada para el inbox de comentarios. `rule` distingue las que
   * entraron a una automatización (`matched`), las que recibieron la respuesta
   * pública de fallback (`fallback`), y las que no hicieron nada (`none`).
   */
  async list(f: CommentListFilters = {}): Promise<CommentRecord[]> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (f.search?.trim()) {
      const like = `%${f.search.trim()}%`;
      conds.push("(text LIKE ? OR author_username LIKE ? OR author_name LIKE ?)");
      params.push(like, like, like);
    }
    if (f.platform?.trim()) {
      conds.push("platform = ?");
      params.push(f.platform.trim());
    }
    if (f.rule === "matched") conds.push("rule_id IS NOT NULL");
    else if (f.rule === "fallback") conds.push("rule_id IS NULL AND public_reply_sent = 1");
    else if (f.rule === "none") conds.push("rule_id IS NULL AND dm_sent = 0 AND public_reply_sent = 0");
    if (f.leg === "dm") conds.push("dm_sent = 1");
    else if (f.leg === "public") conds.push("public_reply_sent = 1");
    if (f.days && f.days > 0) {
      conds.push("created_at >= ?");
      params.push(Date.now() - f.days * 24 * 60 * 60 * 1000);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
    const offset = Math.max(f.offset ?? 0, 0);
    const rows = await this.db.all<CommentRow>(
      `SELECT * FROM comments ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return rows.map(rowToComment);
  }

  /** Conteos para los pills de filtro del inbox (una sola pasada). */
  async counts(): Promise<CommentCounts> {
    const row = await this.db.first<{
      total: number;
      matched: number;
      fallback: number;
      none_count: number;
      dm: number;
      public_reply: number;
    }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN rule_id IS NOT NULL THEN 1 ELSE 0 END) AS matched,
         SUM(CASE WHEN rule_id IS NULL AND public_reply_sent = 1 THEN 1 ELSE 0 END) AS fallback,
         SUM(CASE WHEN rule_id IS NULL AND dm_sent = 0 AND public_reply_sent = 0 THEN 1 ELSE 0 END) AS none_count,
         SUM(CASE WHEN dm_sent = 1 THEN 1 ELSE 0 END) AS dm,
         SUM(CASE WHEN public_reply_sent = 1 THEN 1 ELSE 0 END) AS public_reply
       FROM comments`,
    );
    return {
      total: row?.total ?? 0,
      matched: row?.matched ?? 0,
      fallback: row?.fallback ?? 0,
      none: row?.none_count ?? 0,
      dm: row?.dm ?? 0,
      publicReply: row?.public_reply ?? 0,
    };
  }

  /** Marca el resultado de una respuesta pública (manual o automática). */
  async markPublicReply(id: string, text: string | undefined, sent: boolean): Promise<void> {
    await this.db.run(
      `UPDATE comments SET public_reply_sent = ?, public_reply_text = COALESCE(?, public_reply_text) WHERE id = ?`,
      [sent ? 1 : 0, text ?? null, id],
    );
  }

  /** Marca que se envió (o se intentó) el DM al comentarista. */
  async markDmSent(id: string, sent: boolean): Promise<void> {
    await this.db.run("UPDATE comments SET dm_sent = ? WHERE id = ?", [sent ? 1 : 0, id]);
  }

  async remove(id: string): Promise<void> {
    await this.db.run("DELETE FROM comments WHERE id = ?", [id]);
  }
}
