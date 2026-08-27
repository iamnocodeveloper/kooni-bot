import { describe, it, expect } from "vitest";
import { CommentsRepo } from "../../src/db/comments";

// Stub de Db en memoria (run/first/all).
function makeDb() {
  const rows: any[] = [];
  const db = {
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
      if (/DELETE FROM comments/.test(sql)) {
        rows.splice(rows.findIndex((r) => r.id === params[0]), 1);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
    async first<T = unknown>(sql: string, _params: unknown[] = []): Promise<T | null> {
      if (/COUNT\(\*\) as n FROM comments/.test(sql)) {
        return { n: rows.length } as T;
      }
      return null;
    },
    async all<T = unknown>(sql: string, _params: unknown[] = []): Promise<T[]> {
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
    // El mismo comentario llega de nuevo tras enviar el DM
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
});
