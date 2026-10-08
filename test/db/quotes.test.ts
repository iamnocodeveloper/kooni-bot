import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { QuotesRepo } from "../../src/db/quotes";
import { ConversationsRepo } from "../../src/db/conversations";

let repo: QuotesRepo;
let db: Db;
let convA: string;
let convB: string;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
  repo = new QuotesRepo(db);
  const convs = new ConversationsRepo(db);
  convA = (await convs.getOrCreate("telegram", "a")).id;
  convB = (await convs.getOrCreate("telegram", "b")).id;
});

describe("QuotesRepo", () => {
  it("crea con ítems, calcula subtotal/total y numera", async () => {
    const { id, number } = await repo.create({
      conversationId: convA,
      channel: "telegram",
      channelUserId: "u1",
      clientName: "Ana",
      currency: "MXN",
      discount: 100,
      items: [
        { name: "Photobooth 4h", qty: 1, unitPrice: 4800 },
        { name: "Hora extra", qty: 2, unitPrice: 900 },
      ],
    });
    expect(number).toMatch(/^COT-\d{6}-\d{4}$/);
    const q = (await repo.get(id))!;
    expect(q.subtotal).toBe(6600);
    expect(q.total).toBe(6500); // 6600 - 100
    const items = await repo.items(id);
    expect(items).toHaveLength(2);
    expect(items[0].total).toBe(4800);
  });

  it("list y byConversation", async () => {
    await repo.create({ conversationId: convA, items: [{ name: "A", qty: 1, unitPrice: 10 }] });
    await repo.create({ conversationId: convB, items: [{ name: "B", qty: 1, unitPrice: 20 }] });
    expect((await repo.list()).length).toBe(2);
    const a = await repo.byConversation(convA);
    expect(a).toHaveLength(1);
    expect(a[0].client_name).toBeNull();
  });

  it("latestDraft reusa el borrador y setItems recalcula", async () => {
    const { id } = await repo.create({ conversationId: convA, items: [{ name: "X", qty: 1, unitPrice: 100 }] });
    const draft = await repo.latestDraft(convA);
    expect(draft?.id).toBe(id);
    await repo.setItems(id, [{ name: "Y", qty: 3, unitPrice: 50 }]);
    expect((await repo.get(id))?.subtotal).toBe(150);
  });

  it("markSent incrementa sent_count y pasa draft → sent (una vez)", async () => {
    const { id } = await repo.create({ conversationId: convA, items: [{ name: "A", qty: 1, unitPrice: 5 }] });
    await repo.markSent(id);
    await repo.markSent(id);
    const q = (await repo.get(id))!;
    expect(q.status).toBe("sent");
    expect(q.sent_count).toBe(2);
    expect(q.sent_at).toBeTruthy();
  });

  it("setStatus cambia el estado y registra el evento", async () => {
    const { id } = await repo.create({ conversationId: convA, items: [{ name: "A", qty: 1, unitPrice: 5 }] });
    await repo.setStatus(id, "accepted");
    expect((await repo.get(id))?.status).toBe("accepted");
    const events = (await repo.events(id)).map((e) => e.kind);
    expect(events).toContain("created");
    expect(events).toContain("status:accepted");
  });
});
