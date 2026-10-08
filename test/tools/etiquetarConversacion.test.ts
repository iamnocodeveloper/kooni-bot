import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { LabelsRepo } from "../../src/db/labels";
import { ConversationLabelsRepo } from "../../src/db/conversationLabels";
import { etiquetarConversacionTool } from "../../src/tools/etiquetarConversacion";

let env: any;
let labels: { id: string; name: string }[];

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = (await mf.getD1Database("DB")) as any;
  env = { DB: d1 };
  const repo = new LabelsRepo(new Db(d1));
  const id = await repo.upsert({ name: "Pide factura" });
  labels = [{ id, name: "Pide factura" }];
});

const run = (input: any, conv: string | null = "conv1") =>
  etiquetarConversacionTool(env, () => conv, labels).execute!(input, {} as any) as Promise<any>;

describe("etiquetarConversacionTool", () => {
  it("aplica una etiqueta por id", async () => {
    const r = await run({ etiqueta: "pide_factura", motivo: "pidió comprobante" });
    expect(r.ok).toBe(true);
    const has = await new ConversationLabelsRepo(new Db(env.DB)).has("conv1", "pide_factura");
    expect(has).toBe(true);
  });

  it("acepta el nombre visible además del id", async () => {
    const r = await run({ etiqueta: "Pide factura" });
    expect(r.ok).toBe(true);
  });

  it("rechaza etiquetas desconocidas (no inventa)", async () => {
    const r = await run({ etiqueta: "inexistente" });
    expect(r.ok).toBe(false);
  });

  it("sin conversación activa → ok:false", async () => {
    const r = await run({ etiqueta: "pide_factura" }, null);
    expect(r.ok).toBe(false);
  });
});
