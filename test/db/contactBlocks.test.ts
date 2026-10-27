import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { ContactBlocksRepo } from "../../src/db/contactBlocks";

let repo: ContactBlocksRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  repo = new ContactBlocksRepo(new Db(d1 as any));
});

describe("ContactBlocksRepo", () => {
  it("bloquea por canal+usuario, lista y desbloquea", async () => {
    expect(await repo.isBlocked("waha", "591@c.us")).toBe(false);
    await repo.block({ channel: "waha", channelUserId: "591@c.us", displayName: "Cliente", reason: "spam" });
    expect(await repo.isBlocked("waha", "591@c.us")).toBe(true);
    expect(await repo.isBlocked("telegram", "591@c.us")).toBe(false); // el bloqueo es por canal

    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ channel: "waha", channelUserId: "591@c.us", reason: "spam" });

    await repo.unblock("waha", "591@c.us");
    expect(await repo.isBlocked("waha", "591@c.us")).toBe(false);
    expect(await repo.list()).toHaveLength(0);
  });

  it("re-bloquear es idempotente (no duplica filas)", async () => {
    await repo.block({ channel: "instagram", channelUserId: "ig-1" });
    await repo.block({ channel: "instagram", channelUserId: "ig-1", reason: "otra vez" });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0].reason).toBe("otra vez");
  });
});
