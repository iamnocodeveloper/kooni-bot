import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { LeadsRepo } from "../../src/db/leads";
import { ConversationsRepo } from "../../src/db/conversations";

let repo: LeadsRepo;
let db: Db;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  db = new Db(d1 as any);
  repo = new LeadsRepo(db);
});

describe("LeadsRepo", () => {
  it("creates a lead and lists it", async () => {
    const id = await repo.create({
      name: "María",
      contact: "+5215512345",
      intent: "Corte+barba 5pm",
      conversationId: null,
      channelUserId: "5512345",
    });
    expect(id).toBeTruthy();
    const list = await repo.list(10);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("María");
    expect(list[0].status).toBe("new");
  });

  it("setStatus updates the row", async () => {
    const id = await repo.create({
      name: "Pedro",
      contact: "pedro@x.com",
      intent: "tinte",
      conversationId: null,
      channelUserId: null,
    });
    await repo.setStatus(id, "sold");
    const list = await repo.list(10);
    expect(list[0].status).toBe("sold");
  });

  it("setStatus con nota la agrega a notes con timestamp", async () => {
    const id = await repo.create({ intent: "x", conversationId: null, channelUserId: null });
    await repo.setStatus(id, "contacted", "el cliente pidió precios");
    await repo.setStatus(id, "sold", "compró el paquete");
    const l = (await repo.list(1))[0];
    expect(l.status).toBe("sold");
    expect(l.notes).toContain("el cliente pidió precios");
    expect(l.notes).toContain("compró el paquete");
  });

  it("ensureEntrada crea un lead 'entrada' con los datos de la conversación, una sola vez", async () => {
    const conv = await new ConversationsRepo(db).getOrCreate("telegram", "u42");
    await db.run("UPDATE conversations SET display_name = ? WHERE id = ?", ["Sofía", conv.id]);

    const a = await repo.ensureEntrada(conv.id);
    expect(a.status).toBe("entrada");
    expect(a.name).toBe("Sofía");
    expect(a.contact).toBe("u42");

    const b = await repo.ensureEntrada(conv.id); // idempotente
    expect(b.id).toBe(a.id);
    expect(await repo.list(10)).toHaveLength(1);
  });

  it("byConversation devuelve el lead ligado", async () => {
    const conv = await new ConversationsRepo(db).getOrCreate("telegram", "u1");
    expect(await repo.byConversation(conv.id)).toBeNull();
    await repo.create({ intent: "cita", conversationId: conv.id, channelUserId: "u1" });
    expect((await repo.byConversation(conv.id))?.intent).toBe("cita");
  });
});
