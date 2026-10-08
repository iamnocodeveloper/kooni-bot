import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { LabelsRepo } from "../../src/db/labels";
import { ConversationLabelsRepo } from "../../src/db/conversationLabels";
import { applyKeywordRules, parseLabelIds } from "../../src/labels/engine";
import { segmentMembers } from "../../src/segments";
import { ConversationsRepo } from "../../src/db/conversations";

let env: any;
let repo: LabelsRepo;
let convLabels: ConversationLabelsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = (await mf.getD1Database("DB")) as any;
  env = { DB: d1 };
  repo = new LabelsRepo(new Db(d1));
  convLabels = new ConversationLabelsRepo(new Db(d1));
});

describe("applyKeywordRules (etiquetado en tiempo real)", () => {
  it("aplica la etiqueta cuando el mensaje contiene la palabra", async () => {
    const id = await repo.upsert({ name: "Pide factura" });
    await repo.upsertRule({ labelId: id, kind: "keyword", keywords: ["factura", "comprobante"] });

    const res = await applyKeywordRules(env, "conv1", "Hola, ¿me pasas la factura por favor?");
    expect(res.applied).toEqual([id]);
    expect(await convLabels.has("conv1", id)).toBe(true);
  });

  it("no aplica nada si no matchea (y no rompe con reglas vacías)", async () => {
    const id = await repo.upsert({ name: "Mayorista" });
    await repo.upsertRule({ labelId: id, kind: "keyword", keywords: ["mayoreo"] });
    const res = await applyKeywordRules(env, "conv2", "buenas tardes");
    expect(res.applied).toEqual([]);
    expect(await convLabels.forConversation("conv2")).toEqual([]);
  });

  it("ignora reglas IA y reglas deshabilitadas", async () => {
    const id = await repo.upsert({ name: "X" });
    const kwRule = await repo.upsertRule({ labelId: id, kind: "keyword", keywords: ["hola"] });
    await repo.upsertRule({ labelId: id, kind: "ai", aiInstruction: "comprar" });
    const res = await applyKeywordRules(env, "conv3", "hola hola");
    expect(res.applied).toEqual([id]);
    await repo.removeRule(kwRule);
    expect((await applyKeywordRules(env, "conv4", "hola")).applied).toEqual([]);
  });

  it("no hace nada con texto vacío", async () => {
    expect((await applyKeywordRules(env, "conv5", "   ")).applied).toEqual([]);
  });
});

describe("parseLabelIds", () => {
  it("extrae los ids del JSON del modelo (tolera fences)", () => {
    expect(parseLabelIds('```json\n{"labels":["a","b"]}\n```')).toEqual(["a", "b"]);
    expect(parseLabelIds('{"labels":[]}')).toEqual([]);
    expect(parseLabelIds("no json")).toEqual([]);
  });
});

describe("segmento por etiqueta del usuario", () => {
  it("'label:<id>' trae las conversaciones etiquetadas (alimenta las campañas)", async () => {
    const db = new Db(env.DB);
    const conv = await new ConversationsRepo(db).getOrCreate("telegram", "seg1");
    await db.run(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', 'hola', ?)",
      [crypto.randomUUID(), conv.id, Date.now()],
    );
    await convLabels.add(conv.id, "vip", "manual");
    const members = await segmentMembers(db, "label:vip", Date.now());
    expect(members.map((m) => m.conversationId)).toContain(conv.id);
    expect(members[0].inWindow).toBe(true);
  });
});
