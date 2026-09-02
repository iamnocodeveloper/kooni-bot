import { Db } from "./client";

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
  last_ok_at: number | null;
}

export interface PushEvent {
  id: string;
  title: string;
  body: string;
  url: string;
  created_at: number;
  shown: number;
}

export class PushSubsRepo {
  constructor(private readonly db: Db) {}

  async upsert(s: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    await this.db.run(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
      [s.endpoint, s.p256dh, s.auth, Date.now()],
    );
  }

  async remove(endpoint: string): Promise<void> {
    await this.db.run("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
  }

  async all(): Promise<PushSub[]> {
    return this.db.all<PushSub>("SELECT * FROM push_subscriptions");
  }

  async markOk(endpoint: string): Promise<void> {
    await this.db.run("UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?", [Date.now(), endpoint]);
  }

  async count(): Promise<number> {
    return (await this.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM push_subscriptions"))?.n ?? 0;
  }
}

export class PushEventsRepo {
  constructor(private readonly db: Db) {}

  async add(e: { title: string; body: string; url?: string }): Promise<void> {
    await this.db.run(
      "INSERT INTO push_events (id, title, body, url, created_at) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), e.title, e.body, e.url ?? "/admin/overview", Date.now()],
    );
  }

  /** El más reciente sin mostrar; lo marca `shown`. Para el SW en /admin/push/latest. */
  async takeLatest(): Promise<PushEvent | null> {
    const row = await this.db.first<PushEvent>(
      "SELECT * FROM push_events WHERE shown = 0 ORDER BY created_at DESC LIMIT 1",
    );
    if (row) await this.db.run("UPDATE push_events SET shown = 1 WHERE id = ?", [row.id]);
    return row;
  }

  async purgeOld(cutoffMs: number): Promise<void> {
    await this.db.run("DELETE FROM push_events WHERE created_at < ?", [cutoffMs]);
  }
}
