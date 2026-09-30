import { Db } from "./client";

/**
 * Validación de los cambios de scraping: cada fila de `web_sync_changes` puede
 * marcarse como confirmada o descartada, con una nota. Sirve para que el dueño
 * revise qué cambió entre corridas y lo valide (en vez de solo mirarlo).
 */
export type ReviewStatus = "confirmed" | "rejected";

export interface ChangeReview {
  changeId: string;
  status: ReviewStatus;
  note?: string;
  by?: string;
  at: number;
}

interface ReviewRow {
  change_id: string;
  status: string;
  note: string | null;
  by: string | null;
  at: number;
}

function rowToReview(r: ReviewRow): ChangeReview {
  return {
    changeId: r.change_id,
    status: r.status === "rejected" ? "rejected" : "confirmed",
    note: r.note ?? undefined,
    by: r.by ?? undefined,
    at: r.at,
  };
}

export class ChangeReviewsRepo {
  constructor(private readonly db: Db) {}

  async set(changeId: string, status: ReviewStatus, note: string | undefined, by: string | undefined): Promise<void> {
    await this.db.run(
      `INSERT INTO web_sync_change_reviews (change_id, status, note, by, at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(change_id) DO UPDATE SET status = excluded.status, note = excluded.note, by = excluded.by, at = excluded.at`,
      [changeId, status, note ?? null, by ?? null, Date.now()],
    );
  }

  async get(changeId: string): Promise<ChangeReview | null> {
    const row = await this.db.first<ReviewRow>("SELECT * FROM web_sync_change_reviews WHERE change_id = ?", [changeId]);
    return row ? rowToReview(row) : null;
  }

  /** Mapa changeId → review para pintar el estado en la lista de una corrida. */
  async forChangeIds(ids: string[]): Promise<Map<string, ChangeReview>> {
    const out = new Map<string, ChangeReview>();
    if (ids.length === 0) return out;
    const placeholders = ids.map(() => "?").join(",");
    const rows = await this.db.all<ReviewRow>(
      `SELECT * FROM web_sync_change_reviews WHERE change_id IN (${placeholders})`,
      ids,
    );
    for (const r of rows) out.set(r.change_id, rowToReview(r));
    return out;
  }

  async clear(changeId: string): Promise<void> {
    await this.db.run("DELETE FROM web_sync_change_reviews WHERE change_id = ?", [changeId]);
  }
}
