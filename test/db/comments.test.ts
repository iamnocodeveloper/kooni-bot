import { describe, it, expect } from "vitest";
import { CommentsRepo } from "../../src/db/comments";

// Stub de Db en memoria (run/first/all). Guarda el último SQL de `all` para
// poder verificar el WHERE que arma `list()` sin un motor SQL real.
function makeDb() {
  const rows: any[] = [];
  const state = { lastAllSql: "", lastAllParams: [] as unknown[] };
  const db = {
    state,
    async run(sql: string, params: unknown[] = []) {
      if (/INSERT INTO comments/.test(sql)) {
        const existing = rows.find((r) => r.id === params[0]);
        if (existing) {
          existing.text = params[3] ?? existing.text;
          existing.post_id = params[1] ?? existing.post_id;
          existing.platform_post_id = params[2] ?? existing.platform_post_id;
          existing.rule_id = params[9] ?? existing.rule_id;
          existing.dm_sent = Math.max(existing.dm_sent, Number(params[10] ?? 0));
          existing.public_reply_sent = Math.max(existing.public_reply_sent, Number(params[11] ?? 0));
          existing.public_reply_text = params[12] ?? existing.public_reply_text;
        } else {
          rows.push({
            id: params[0],
            post_id: params[1],
            platform_post_id: params[2],
            text: params[3],
            author_username: params[4],
            author_name: params[5],
            author_id: params[6],
            platform: params[7],
            account_id: params[8],
            rule_id: params[9],
            dm_sent: params[10],
            public_reply_sent: params[11],
            public_reply_text: params[12],
            created_at: params[13],
          });
        }
        return { meta: { changes: 1 } };
      }
      if (/UPDATE comments SET public_reply_sent/.test(sql)) {
        const r = rows.find((x) => x.id === params[2]);
        if (r) {
          r.public_reply_sent = params[0];
          r.public_reply_text = params[1] ?? r.public_reply_text;
        }
        return { meta: { changes: 1 } };
      }
      if (/UPDATE comments SET dm_sent/.test(sql)) {
        const r = rows.find((x) => x.id === params[1]);
        if (r) r.dm_sent = params[0];
        return { meta: { changes: 1 } };
      }
      if (/DELETE FROM comments/.test(sql)) {
        rows.splice(rows.findIndex((r) => r.id === params[0]), 1);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/COUNT\(\*\) as n FROM comments/.test(sql)) {
        return { n: rows.length } as T;
      }
      if (/AS total/.test(sql)) {
        const total = rows.length;
        const matched = rows.filter((r) => r.rule_id != null).length;
        const fallback = rows.filter((r) => r.rule_id == null && r.public_reply_sent === 1).length;
        const none_count = rows.filter((r) => r.rule_id == null && !r.dm_sent && !r.public_reply_sent).length;
        const dm = rows.filter((r) => r.dm_sent).length;
        const public_reply = rows.filter((r) => r.public_reply_sent).length;
        return { total, matched, fallback, none_count, dm, public_reply } as T;
      }
      if (/WHERE id = \?/.test(sql)) {
        return (rows.find((r) => r.id === params[0]) as T) ?? null;
      }
      return null;
    },
    async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
      state.lastAllSql = sql;
      state.lastAllParams = params;
      if (/FROM comments/.test(sql)) {
        return rows.sort((a, b) => b.created_at - a.created_at) as T[];
      }
      return [] as T[];
    },
  };
  return db;
}

describe("CommentsRepo", () => {
  it("guarda un comentario y lo devuelve en recent()", async () => {
    const db = makeDb();
    const repo = new CommentsRepo(db as any);
    await repo.upsert({
      id: "cm_1",
      postId: "post_1",
      text: "me interesa el precio",
      authorUsername: "maria.g",
      platform: "instagram",
      createdAt: 1000,
    });
    const recent = await repo.recent(10);
    expect(recent.length).toBe(1);
    expect(recent[0].text).toBe("me interesa el precio");
    expect(recent[0].authorUsername).toBe("maria.g");
    expect(recent[0].dmSent).toBe(false);
  });

  it("upsert por id: actualiza el estado (dm_sent) sin duplicar", async () => {
    const db = makeDb();
    const repo = new CommentsRepo(db as any);
    await repo.upsert({ id: "cm_2", text: "hola", createdAt: 1 });
    await repo.upsert({ id: "cm_2", ruleId: "r1", dmSent: true, publicReplySent: true, publicReplyText: "Gracias!" });
    const recent = await repo.recent(10);
    expect(recent.length).toBe(1);
    expect(recent[0].dmSent).toBe(true);
    expect(recent[0].publicReplySent).toBe(true);
    expect(recent[0].ruleId).toBe("r1");
  });

  it("count() devuelve el total", async () => {
    const db = makeDb();
    const repo = new CommentsRepo(db as any);
    await repo.upsert({ id: "a", text: "1", createdAt: 1 });
    await repo.upsert({ id: "b", text: "2", createdAt: 2 });
    expect(await repo.count()).toBe(2);
  });

  it("getById devuelve el comentario (o null)", async () => {
    const db = makeDb();
    const repo = new CommentsRepo(db as any);
    await repo.upsert({ id: "cm_x", text: "hola", platform: "facebook", createdAt: 5 });
    const found = await repo.getById("cm_x");
    expect(found?.text).toBe("hola");
    expect(found?.platform).toBe("facebook");
    expect(await repo.getById("nope")).toBeNull();
  });

  it("list() filtra por regla (matched / fallback / none)", async () => {
    const db = makeDb();
    const repo = new CommentsRepo(db as any);
    await repo.list({ rule: "matched" });
    expect(db.state.lastAllSql).toContain("rule_id IS NOT NULL");
    await repo.list({ rule: "fallback" });
    expect(db.state.lastAllSql).toContain("rule_id IS NULL AND public_reply_sent = 1");
    await repo.list({ rule: "none" });
    expect(db.state.lastAllSql).toContain("rule_id IS NULL AND dm_sent = 0 AND public_reply_sent = 0");
  });

  it("list() filtra por pata, plataforma, búsqueda y días", async () => {
    const db = makeDb();
    const repo = new CommentsRepo(db as any);
    await repo.list({ leg: "dm" });
    expect(db.state.lastAllSql).toContain("dm_sent = 1");
    await repo.list({ leg: "public" });
    expect(db.state.lastAllSql).toContain("public_reply_sent = 1");
    await repo.list({ platform: "instagram", search: "precio", days: 7 });
    expect(db.state.lastAllSql).toContain("platform = ?");
    expect(db.state.lastAllSql).toContain("text LIKE ?");
    expect(db.state.lastAllSql).toContain("created_at >= ?");
    // params: [like, like, like, platform, windowStart, limit, offset]
    expect(db.state.lastAllParams).toHaveLength(7);
  });

  it("counts() mapea los NULL de SUM a 0 y cuenta cada grupo", async () => {
    const db = makeDb();
    const repo = new CommentsRepo(db as any);
    const empty = await repo.counts();
    expect(empty).toEqual({ total: 0, matched: 0, fallback: 0, none: 0, dm: 0, publicReply: 0 });

    await repo.upsert({ id: "c1", ruleId: "r1", dmSent: true, createdAt: 1 });
    await repo.upsert({ id: "c2", publicReplySent: true, createdAt: 2 }); // fallback
    await repo.upsert({ id: "c3", createdAt: 3 }); // sin automatización
    const c = await repo.counts();
    expect(c.total).toBe(3);
    expect(c.matched).toBe(1);
    expect(c.fallback).toBe(1);
    expect(c.none).toBe(1);
    expect(c.dm).toBe(1);
    expect(c.publicReply).toBe(1);
  });

  it("markPublicReply / markDmSent actualizan el estado", async () => {
    const db = makeDb();
    const repo = new CommentsRepo(db as any);
    await repo.upsert({ id: "c9", createdAt: 1 });
    await repo.markPublicReply("c9", "gracias!", true);
    await repo.markDmSent("c9", true);
    const c = await repo.getById("c9");
    expect(c?.publicReplySent).toBe(true);
    expect(c?.publicReplyText).toBe("gracias!");
    expect(c?.dmSent).toBe(true);
  });
});
