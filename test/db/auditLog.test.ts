import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { AuditRepo } from "../../src/db/auditLog";

let repo: AuditRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  repo = new AuditRepo(new Db((await mf.getD1Database("DB")) as any));
});

describe("AuditRepo", () => {
  it("log + list round-trip, más reciente primero", async () => {
    await repo.log({ action: "login.ok", at: 1000, actorIpHash: "h1" });
    await repo.log({ action: "settings.update", at: 2000, target: "tone", beforeVal: "a", afterVal: "b" });
    const rows = await repo.list();
    expect(rows.map((r) => r.action)).toEqual(["settings.update", "login.ok"]);
    expect(rows[0].beforeVal).toBe("a");
    expect(rows[0].result).toBe("ok");
  });

  it("filtra por acción, actor y texto", async () => {
    await repo.log({ action: "settings.update", at: 1, target: "tone", targetLabel: "Tono del bot", actorIpHash: "h1" });
    await repo.log({ action: "settings.update", at: 2, target: "bot_name", targetLabel: "Nombre del bot", actorIpHash: "h2" });
    await repo.log({ action: "login.fail", at: 3, actorIpHash: "h1", result: "denied" });

    expect(await repo.list({ action: "login.fail" })).toHaveLength(1);
    expect(await repo.list({ actorIpHash: "h1" })).toHaveLength(2);
    expect(await repo.list({ text: "Nombre" })).toHaveLength(1);
  });

  it("paginación keyset con `before`", async () => {
    for (let i = 1; i <= 5; i++) await repo.log({ action: "x", at: i * 100 });
    const page1 = await repo.list({ limit: 2 });
    expect(page1.map((r) => r.at)).toEqual([500, 400]);
    const page2 = await repo.list({ limit: 2, before: page1[page1.length - 1].at });
    expect(page2.map((r) => r.at)).toEqual([300, 200]);
  });

  it("distinctActions y purgeOld", async () => {
    await repo.log({ action: "a", at: 100 });
    await repo.log({ action: "b", at: 200 });
    await repo.log({ action: "a", at: 300 });
    expect(await repo.distinctActions()).toEqual(["a", "b"]);
    expect(await repo.purgeOld(250)).toBe(2);
    expect(await repo.count()).toBe(1);
  });
});
