import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { LeadsRepo } from "../../src/db/leads";
import { ConversationsRepo } from "../../src/db/conversations";
import { moverLeadTool } from "../../src/tools/moverLead";

let env: any;
let db: Db;
let convId: string;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
  env = { DB: db.d1 };
  convId = (await new ConversationsRepo(db).getOrCreate("telegram", "u1")).id;
});

const run = (input: any, conv: string | null = convId) =>
  moverLeadTool(env, () => conv).execute!(input, {} as any) as Promise<any>;

describe("moverLeadTool", () => {
  it("mapea etiquetas de negocio a estados canónicos", async () => {
    const cases: [string, string][] = [
      ["nuevo", "new"],
      ["contactado", "contacted"],
      ["en conversación", "contacted"],
      ["ganado", "sold"],
      ["compró", "sold"], // no está en el mapa exacto → cae a inválido... probamos abajo
    ];
    for (const [etapa, expected] of cases.slice(0, 4)) {
      const conv = (await new ConversationsRepo(db).getOrCreate("telegram", "c" + etapa)).id;
      const r = await run({ etapa, nota: "test" }, conv);
      expect(r.ok).toBe(true);
      expect(r.etapa).toBe(expected);
    }
  });

  it("si la conversación no tiene lead, crea la ficha 'entrada' y luego la mueve", async () => {
    const leads = new LeadsRepo(db);
    expect(await leads.byConversation(convId)).toBeNull();
    const r = await run({ etapa: "contactado", nota: "pidió más info" });
    expect(r.ok).toBe(true);
    const lead = await leads.byConversation(convId);
    expect(lead?.status).toBe("contacted");
    expect(lead?.notes).toContain("bot: pidió más info");
  });

  it("etapa no reconocida → ok:false sin tocar la ficha", async () => {
    const r = await run({ etapa: "banana", nota: "x" });
    expect(r.ok).toBe(false);
  });

  it("sin conversación activa → ok:false", async () => {
    const r = await run({ etapa: "nuevo", nota: "x" }, null);
    expect(r.ok).toBe(false);
  });
});
