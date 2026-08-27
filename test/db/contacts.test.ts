import { describe, it, expect } from "vitest";
import { ContactsRepo } from "../../src/db/contacts";

// Stub de Db en memoria (run/first/all).
function makeDb() {
  const rows: any[] = [];
  const db = {
    async run(sql: string, params: unknown[] = []) {
      if (/INSERT INTO contacts/.test(sql)) {
        const existing = rows.find((r) => r.channel === params[1] && r.channel_user_id === params[2]);
        if (existing) {
          existing.display_name = params[3] ?? existing.display_name;
          existing.username = params[4] ?? existing.username;
          existing.last_interaction_at = Math.max(existing.last_interaction_at, Number(params[5]));
          existing.interaction_count = existing.interaction_count + 1;
        } else {
          rows.push({
            id: params[0],
            channel: params[1],
            channel_user_id: params[2],
            display_name: params[3],
            username: params[4],
            last_interaction_at: Number(params[5]),
            first_seen_at: Number(params[6]),
            interaction_count: 1, // hardcodeado en el INSERT
          });
        }
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
    async first<T = unknown>(sql: string, _params: unknown[] = []): Promise<T | null> {
      if (/COUNT\(\*\) as n FROM contacts/.test(sql)) {
        return { n: rows.length } as T;
      }
      return null;
    },
    async all<T = unknown>(sql: string, _params: unknown[] = []): Promise<T[]> {
      if (/FROM contacts/.test(sql)) {
        return rows.sort((a, b) => b.last_interaction_at - a.last_interaction_at) as T[];
      }
      return [] as T[];
    },
  };
  return db;
}

describe("ContactsRepo", () => {
  it("crea un contacto en la primera interacción", async () => {
    const db = makeDb();
    const repo = new ContactsRepo(db as any);
    await repo.touch({ channel: "zernio", channelUserId: "acct:user1", displayName: "María", at: 1000 });
    const recent = await repo.recent(10);
    expect(recent.length).toBe(1);
    expect(recent[0].displayName).toBe("María");
    expect(recent[0].interactionCount).toBe(1);
  });

  it("actualiza (no duplica) al volver a interactuar, e incrementa el contador", async () => {
    const db = makeDb();
    const repo = new ContactsRepo(db as any);
    await repo.touch({ channel: "zernio", channelUserId: "acct:user1", displayName: "María", at: 1000 });
    await repo.touch({ channel: "zernio", channelUserId: "acct:user1", displayName: "María G.", at: 2000 });
    const recent = await repo.recent(10);
    expect(recent.length).toBe(1);
    expect(recent[0].displayName).toBe("María G."); // COALESCE actualiza
    expect(recent[0].interactionCount).toBe(2);
    expect(recent[0].lastInteractionAt).toBe(2000);
  });

  it("usuarios distintos son contactos distintos", async () => {
    const db = makeDb();
    const repo = new ContactsRepo(db as any);
    await repo.touch({ channel: "zernio", channelUserId: "acct:u1", at: 1 });
    await repo.touch({ channel: "zernio", channelUserId: "acct:u2", at: 2 });
    expect(await repo.count()).toBe(2);
  });
});
