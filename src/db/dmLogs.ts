import { Db } from "./client";

/** Estado de un comentario procesado (dedup: Meta permite 1 DM por comentario). */
export type ProcessedStatus = "sent" | "skipped_dedup" | "failed";

/** Estado de un log de automatización. */
export type DmLogStatus = "sent" | "skipped" | "failed";

/**
 * Dedup + logs de automatizaciones (port OpenReply).
 *
 * - processed_comments: garantiza que un comment_id NO reciba más de un DM
 *   privado, sin importar cuántas reglas coincidan ni cuántas veces llegue el
 *   webhook (Zernio reintenta). Meta rechaza el 2º DM con "invalid for a
 *   private reply" — esto lo evita antes de gastar la llamada.
 * - dm_logs: historial visible en el panel (quién, qué, estado, motivo).
 */
export class DmLogsRepo {
  constructor(private readonly db: Db) {}

  // ── Dedup de comentarios ────────────────────────────────────────────────

  /** ¿Este comentario ya recibió un DM (en CUALQUIER regla)? */
  async commentAlreadyDmed(commentId: string): Promise<boolean> {
    const row = await this.db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM processed_comments WHERE comment_id = ? AND status = 'sent'",
      [commentId],
    );
    return (row?.n ?? 0) > 0;
  }

  /** Marca un comentario como procesado (sent | skipped | failed). */
  async recordProcessedComment(input: {
    commentId: string;
    ruleId: string;
    status: ProcessedStatus;
    matchedKeyword?: string;
    dmSentAt?: number;
    publicReplySentAt?: number;
    error?: string;
  }): Promise<void> {
    const now = Date.now();
    await this.db.run(
      `INSERT INTO processed_comments (comment_id, rule_id, status, matched_keyword, dm_sent_at, public_reply_sent_at, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(comment_id) DO UPDATE SET
         status = excluded.status,
         matched_keyword = COALESCE(excluded.matched_keyword, processed_comments.matched_keyword),
         dm_sent_at = COALESCE(excluded.dm_sent_at, processed_comments.dm_sent_at),
         public_reply_sent_at = COALESCE(excluded.public_reply_sent_at, processed_comments.public_reply_sent_at),
         error = COALESCE(excluded.error, processed_comments.error)`,
      [
        input.commentId,
        input.ruleId,
        input.status,
        input.matchedKeyword ?? null,
        input.dmSentAt ?? null,
        input.publicReplySentAt ?? null,
        input.error ?? null,
        now,
      ],
    );
  }

  // ── Logs de automatizaciones ────────────────────────────────────────────

  async log(input: {
    ruleId?: string;
    kind: string;
    platform?: string;
    target?: string;
    username?: string;
    message?: string;
    status: DmLogStatus;
    error?: string;
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO dm_logs (id, rule_id, kind, platform, target, username, message, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.ruleId ?? null,
        input.kind,
        input.platform ?? null,
        input.target ?? null,
        input.username ?? null,
        input.message ? input.message.slice(0, 300) : null,
        input.status,
        input.error ? input.error.slice(0, 300) : null,
        Date.now(),
      ],
    );
  }

  /** Últimos N logs (para el historial del panel). */
  async recent(limit = 50): Promise<
    { id: string; ruleId: string | null; kind: string; platform: string | null; target: string | null; username: string | null; message: string | null; status: string; error: string | null; createdAt: number }[]
  > {
    return this.db.all(
      `SELECT id, rule_id as ruleId, kind, platform, target, username, message, status, error, created_at as createdAt
       FROM dm_logs ORDER BY created_at DESC LIMIT ?`,
      [limit],
    );
  }

  // ── Rate limit por cuenta (Fase 5 OpenReply) ────────────────────────────

  /**
   * Reserva un slot de DM para la hora actual de la cuenta. Tope default 700
   * (Meta: 750/hora, margen de seguridad). Sin Redis: contador en D1 con
   * ventana de 1 hora (PK account_id+window_start) + upsert condicional.
   * Devuelve false cuando la cuenta ya agotó su cupo de esta hora.
   */
  async reserveDmSlot(accountId: string, max = 700): Promise<boolean> {
    const windowStart = Math.floor(Date.now() / 3600_000) * 3600_000;
    // 1) Intentar incrementar si la fila existe y tiene cupo.
    const upd = await this.db.run(
      `UPDATE dm_rate_limits SET count = count + 1
       WHERE account_id = ? AND window_start = ? AND count < ?`,
      [accountId, windowStart, max],
    );
    if (upd.meta?.changes === 1) return true;
    // 2) No existía la fila (hora nueva): crearla con count=1.
    try {
      const ins = await this.db.run(
        `INSERT INTO dm_rate_limits (account_id, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(account_id, window_start) DO NOTHING`,
        [accountId, windowStart],
      );
      if (ins.meta?.changes === 1) return true;
      // 3) Carrera: la fila ya existía y estaba llena → reintentar el update.
      const upd2 = await this.db.run(
        `UPDATE dm_rate_limits SET count = count + 1
         WHERE account_id = ? AND window_start = ? AND count < ?`,
        [accountId, windowStart, max],
      );
      return upd2.meta?.changes === 1;
    } catch (e) {
      console.warn("[rate] reserva de slot falló:", e);
      return false;
    }
  }

  /** Consumo actual de la cuenta en esta hora (para el panel). */
  async currentHourUsage(accountId: string): Promise<{ used: number; windowStart: number }> {
    const windowStart = Math.floor(Date.now() / 3600_000) * 3600_000;
    const row = await this.db.first<{ count: number }>(
      "SELECT count FROM dm_rate_limits WHERE account_id = ? AND window_start = ?",
      [accountId, windowStart],
    );
    return { used: row?.count ?? 0, windowStart };
  }
}
