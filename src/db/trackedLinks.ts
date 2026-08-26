import { Db } from "./client";

/** Link trackeado de una regla de automatización: se sirve vía /r/:slug → 302. */
export interface TrackedLink {
  id: string;
  ruleId: string;
  slug: string;
  destinationUrl: string;
  label?: string;
  createdAt: number;
}

interface TrackedLinkRow {
  id: string;
  rule_id: string;
  slug: string;
  destination_url: string;
  label: string | null;
  created_at: number;
}

function rowToLink(row: TrackedLinkRow): TrackedLink {
  return {
    id: row.id,
    ruleId: row.rule_id,
    slug: row.slug,
    destinationUrl: row.destination_url,
    label: row.label ?? undefined,
    createdAt: row.created_at,
  };
}

function generateSlug(): string {
  // 7 bytes base64url → ~10 chars, suficiente para no chocar.
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 10);
}

export class TrackedLinksRepo {
  constructor(private readonly db: Db) {}

  async listByRule(ruleId: string): Promise<TrackedLink[]> {
    const rows = await this.db.all<TrackedLinkRow>(
      "SELECT * FROM auto_rule_links WHERE rule_id = ? ORDER BY created_at ASC",
      [ruleId],
    );
    return rows.map(rowToLink);
  }

  async getBySlug(slug: string): Promise<TrackedLink | null> {
    const row = await this.db.first<TrackedLinkRow>(
      "SELECT * FROM auto_rule_links WHERE slug = ?",
      [slug],
    );
    return row ? rowToLink(row) : null;
  }

  /** Crea (o reusa) un link trackeado para una regla. Si `url` ya es un /r/:slug, lo devuelve tal cual. */
  async ensureForRule(ruleId: string, url: string, label?: string): Promise<TrackedLink> {
    // Si el dueño ya pegó un slug propio (ej. /r/abc), no lo re-trackeamos.
    const existing = (await this.listByRule(ruleId)).find(
      (l) => l.destinationUrl === url || l.slug === url.replace(/^\/r\//, ""),
    );
    if (existing) return existing;

    const id = crypto.randomUUID();
    const now = Date.now();
    const slug = generateSlug();
    await this.db.run(
      `INSERT INTO auto_rule_links (id, rule_id, slug, destination_url, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, ruleId, slug, url, label?.trim() || null, now],
    );
    const created = await this.getBySlug(slug);
    if (!created) throw new Error("tracked link create failed");
    return created;
  }

  async removeByRule(ruleId: string): Promise<void> {
    await this.db.run("DELETE FROM auto_rule_links WHERE rule_id = ?", [ruleId]);
  }

  /** Cuenta clicks de un slug (para el panel: total y por día). */
  async clickCount(slug: string): Promise<number> {
    const row = await this.db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM auto_rule_clicks WHERE slug = ?",
      [slug],
    );
    return row?.n ?? 0;
  }

  /** Registra un click (para el redirect /r/:slug). Devuelve la url destino. */
  async registerClick(slug: string, ipHash: string | null): Promise<string | null> {
    const link = await this.getBySlug(slug);
    if (!link) return null;
    await this.db.run(
      "INSERT INTO auto_rule_clicks (id, slug, ip_hash, clicked_at) VALUES (?, ?, ?, ?)",
      [crypto.randomUUID(), slug, ipHash, Date.now()],
    );
    return link.destinationUrl;
  }
}
