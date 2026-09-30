import { describe, it, expect } from "vitest";
import { ChangeReviewsRepo } from "../../src/db/changeReviews";

// Stub de Db en memoria con semántica de UPSERT/IN por change_id.
function makeDb() {
  const rows: any[] = [];
  return {
    async run(sql: string, params: unknown[] = []) {
      if (/INSERT INTO web_sync_change_reviews/.test(sql)) {
        const existing = rows.find((r) => r.change_id === params[0]);
        const next = { change_id: params[0], status: params[1], note: params[2], by: params[3], at: params[4] };
        if (existing) Object.assign(existing, next);
        else rows.push(next);
        return { meta: { changes: 1 } };
      }
      if (/DELETE FROM web_sync_change_reviews/.test(sql)) {
        const i = rows.findIndex((r) => r.change_id === params[0]);
        if (i >= 0) rows.splice(i, 1);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/WHERE change_id = \?/.test(sql)) return (rows.find((r) => r.change_id === params[0]) as T) ?? null;
      return null;
    },
    async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (/IN \(/.test(sql)) return rows.filter((r) => params.includes(r.change_id)) as T[];
      return rows as T[];
    },
  };
}

describe("ChangeReviewsRepo", () => {
  it("marca un cambio como confirmado y lo lee", async () => {
    const repo = new ChangeReviewsRepo(makeDb() as any);
    await repo.set("ch_1", "confirmed", undefined, undefined);
    expect((await repo.get("ch_1"))?.status).toBe("confirmed");
  });

  it("upsert: cambiar de estado no duplica", async () => {
    const db = makeDb();
    const repo = new ChangeReviewsRepo(db as any);
    await repo.set("ch_2", "confirmed", undefined, undefined);
    await repo.set("ch_2", "rejected", undefined, undefined);
    const r = await repo.get("ch_2");
    expect(r?.status).toBe("rejected");
    expect((await (db as any).all("SELECT * FROM web_sync_change_reviews")).length).toBe(1);
  });

  it("forChangeIds devuelve solo los pedidos", async () => {
    const repo = new ChangeReviewsRepo(makeDb() as any);
    await repo.set("a", "confirmed", undefined, undefined);
    await repo.set("b", "rejected", undefined, undefined);
    const map = await repo.forChangeIds(["a"]);
    expect(map.get("a")?.status).toBe("confirmed");
    expect(map.get("b")).toBeUndefined();
  });

  it("clear vuelve el cambio a pendiente", async () => {
    const repo = new ChangeReviewsRepo(makeDb() as any);
    await repo.set("c", "confirmed", undefined, undefined);
    await repo.clear("c");
    expect(await repo.get("c")).toBeNull();
  });
});
