import { Db } from "./client";

/**
 * Contexto de la publicación (post) a la que pertenece un comentario. Permite
 * que la pestaña "Comentarios" muestre a qué publicación se comentó (caption +
 * permalink + imagen), algo que el webhook por sí solo no trae de forma fiable.
 *
 * Se rellena desde el bloque `post` del webhook `comment.received` y, si falta o
 * está viejo, se completa bajo demanda con `GET /v1/inbox/comments/{postId}`.
 */
export interface CommentPost {
  postId: string;
  platformPostId?: string;
  platform?: string;
  accountId?: string;
  caption?: string;
  permalink?: string;
  picture?: string;
  fetchedAt: number;
}

interface CommentPostRow {
  post_id: string;
  platform_post_id: string | null;
  platform: string | null;
  account_id: string | null;
  caption: string | null;
  permalink: string | null;
  picture: string | null;
  fetched_at: number;
}

function rowToPost(row: CommentPostRow): CommentPost {
  return {
    postId: row.post_id,
    platformPostId: row.platform_post_id ?? undefined,
    platform: row.platform ?? undefined,
    accountId: row.account_id ?? undefined,
    caption: row.caption ?? undefined,
    permalink: row.permalink ?? undefined,
    picture: row.picture ?? undefined,
    fetchedAt: row.fetched_at,
  };
}

/** TTL del contexto del post: los endpoints de lectura de Zernio cachean ≤10 min,
 *  así que refrescar cada 6 h es de sobra. */
export const POST_CONTEXT_TTL_MS = 6 * 60 * 60 * 1000;

export class CommentPostsRepo {
  constructor(private readonly db: Db) {}

  async get(postId: string): Promise<CommentPost | null> {
    const row = await this.db.first<CommentPostRow>(
      "SELECT * FROM comment_posts WHERE post_id = ?",
      [postId],
    );
    return row ? rowToPost(row) : null;
  }

  /** Guarda/actualiza el contexto del post. Nunca pisa un dato bueno con null. */
  async upsert(input: {
    postId: string;
    platformPostId?: string;
    platform?: string;
    accountId?: string;
    caption?: string;
    permalink?: string;
    picture?: string;
    fetchedAt?: number;
  }): Promise<void> {
    if (!input.postId) return;
    await this.db.run(
      `INSERT INTO comment_posts (post_id, platform_post_id, platform, account_id, caption, permalink, picture, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(post_id) DO UPDATE SET
         platform_post_id = COALESCE(excluded.platform_post_id, comment_posts.platform_post_id),
         platform = COALESCE(excluded.platform, comment_posts.platform),
         account_id = COALESCE(excluded.account_id, comment_posts.account_id),
         caption = COALESCE(excluded.caption, comment_posts.caption),
         permalink = COALESCE(excluded.permalink, comment_posts.permalink),
         picture = COALESCE(excluded.picture, comment_posts.picture),
         fetched_at = excluded.fetched_at`,
      [
        input.postId,
        input.platformPostId ?? null,
        input.platform ?? null,
        input.accountId ?? null,
        input.caption ?? null,
        input.permalink ?? null,
        input.picture ?? null,
        input.fetchedAt ?? Date.now(),
      ],
    );
  }

  /** ¿Hay contexto fresco (dentro del TTL)? */
  async isFresh(postId: string, ttlMs = POST_CONTEXT_TTL_MS): Promise<boolean> {
    const post = await this.get(postId);
    return !!post && Date.now() - post.fetchedAt < ttlMs;
  }
}
