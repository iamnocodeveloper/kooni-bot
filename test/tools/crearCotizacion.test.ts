import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { ConversationsRepo } from "../../src/db/conversations";
import { QuotesRepo } from "../../src/db/quotes";
import { crearCotizacionTool } from "../../src/tools/crearCotizacion";

let env: any;
let db: Db;
let convId: string;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
  env = { DB: db.d1 };
  convId = (await new ConversationsRepo(db).getOrCreate("telegram", "u1")).id;
});

const ctx = () => ({ channel: "telegram" as const, channelUserId: "u1" });
const run = (input: any, conv: string | null = convId) =>
  crearCotizacionTool(env, () => conv, ctx).execute!(input, {} as any) as Promise<any>;

describe("crearCotizacionTool", () => {
  it("crea el borrador con los ítems y devuelve total", async () => {
    const r = await run({
      items: [
        { name: "Photobooth 4h", qty: 1, unitPrice: 4800 },
        { name: "Hora extra", qty: 2, unitPrice: 900 },
      ],
      clientName: "Ana",
      eventType: "XV años",
    });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(6600);
    expect(r.enviada).toBe(false);
    const quotes = await new QuotesRepo(db).byConversation(convId);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].status).toBe("draft");
    expect(quotes[0].channel_user_id).toBe("u1");
  });

  it("reusa el borrador existente en vez de duplicar", async () => {
    await run({ items: [{ name: "A", qty: 1, unitPrice: 100 }] });
    const r2 = await run({ items: [{ name: "B", qty: 2, unitPrice: 200 }] });
    expect(r2.ok).toBe(true);
    const quotes = await new QuotesRepo(db).byConversation(convId);
    expect(quotes).toHaveLength(1);
    expect((await new QuotesRepo(db).items(quotes[0].id)).map((i) => i.name)).toEqual(["B"]);
  });

  it("sin conversación activa → ok:false", async () => {
    const r = await run({ items: [{ name: "A", qty: 1, unitPrice: 1 }] }, null);
    expect(r.ok).toBe(false);
  });
});
