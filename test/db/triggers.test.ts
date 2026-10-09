import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { TriggersRepo } from "../../src/db/triggers";

let repo: TriggersRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  repo = new TriggersRepo(new Db((await mf.getD1Database("DB")) as any));
});

describe("TriggersRepo", () => {
  it("crea (keyword), lista ordenado por prioridad y filtra habilitados", async () => {
    await repo.upsert({ name: "B", matchKind: "keyword", keywords: ["b"], action: "reply_fixed", priority: 1 });
    await repo.upsert({ name: "A", matchKind: "keyword", keywords: ["a"], action: "reply_fixed", priority: 5 });
    const list = await repo.list();
    expect(list.map((t) => t.name)).toEqual(["A", "B"]);
    expect((await repo.enabled())).toHaveLength(2);
  });

  it("guarda keywords y payload como JSON parseable", async () => {
    const id = await repo.upsert({ name: "X", matchKind: "keyword", keywords: ["uno", "dos"], action: "reply_fixed", actionPayload: { message: "hola" } });
    const tr = (await repo.get(id))!;
    expect(TriggersRepo.keywordsOf(tr)).toEqual(["uno", "dos"]);
    expect(TriggersRepo.parsePayload(tr)).toEqual({ message: "hola" });
  });

  it("pasos de un flujo: setSteps y steps en orden", async () => {
    const id = await repo.upsert({ name: "Flow", matchKind: "any", action: "flow" });
    await repo.setSteps(id, [
      { kind: "text", content: "Paso 1", delayMinutes: 0 },
      { kind: "text", content: "Paso 2", delayMinutes: 5 },
    ]);
    const steps = await repo.steps(id);
    expect(steps.map((s) => s.content)).toEqual(["Paso 1", "Paso 2"]);
    expect(steps[1].delay_minutes).toBe(5);
  });

  it("pasos de un flujo: adjunta un recurso (media) al paso por idx", async () => {
    const id = await repo.upsert({ name: "FlowM", matchKind: "any", action: "flow" });
    await repo.setSteps(id, [
      { kind: "text", content: "Mirá", delayMinutes: 0, resource: "ofertas" },
      { kind: "text", content: "Otra cosa", delayMinutes: 0 },
    ]);
    const steps = await repo.steps(id);
    expect(steps[0].media?.resource).toBe("ofertas");
    expect(steps[1].media).toBeUndefined();
  });

  it("toggle y delete (borra los pasos)", async () => {
    const id = await repo.upsert({ name: "T", matchKind: "any", action: "flow" });
    await repo.setSteps(id, [{ kind: "text", content: "x", delayMinutes: 0 }]);
    await repo.setEnabled(id, false);
    expect((await repo.get(id))?.enabled).toBe(0);
    await repo.remove(id);
    expect(await repo.get(id)).toBeNull();
    expect(await repo.steps(id)).toHaveLength(0);
  });
});
