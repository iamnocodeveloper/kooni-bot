import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import {
  ConversationLabelsRepo,
  NEEDS_HUMAN_LABEL,
  labelMeta,
} from "../../src/db/conversationLabels";

let repo: ConversationLabelsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  repo = new ConversationLabelsRepo(new Db(d1 as any));
});

describe("ConversationLabelsRepo (etiquetas del CRM)", () => {
  it("agrega (idempotente), consulta y quita", async () => {
    await repo.add("conv1", NEEDS_HUMAN_LABEL, "bot");
    await repo.add("conv1", NEEDS_HUMAN_LABEL, "bot"); // no duplica
    expect(await repo.has("conv1", NEEDS_HUMAN_LABEL)).toBe(true);
    expect(await repo.forConversation("conv1")).toEqual([NEEDS_HUMAN_LABEL]);

    await repo.remove("conv1", NEEDS_HUMAN_LABEL);
    expect(await repo.has("conv1", NEEDS_HUMAN_LABEL)).toBe(false);
    expect(await repo.forConversation("conv1")).toEqual([]);
  });

  it("byConversationIds trae las etiquetas de varias en una query", async () => {
    await repo.add("a", NEEDS_HUMAN_LABEL);
    await repo.add("b", "vip");
    await repo.add("b", NEEDS_HUMAN_LABEL);
    const map = await repo.byConversationIds(["a", "b", "c", ""]);
    expect(map["a"]).toEqual([NEEDS_HUMAN_LABEL]);
    expect(map["b"]!.sort()).toEqual(["atencion_humana", "vip"]);
    expect(map["c"]).toBeUndefined();
  });

  it("countByLabel cuenta conversaciones con la etiqueta", async () => {
    await repo.add("a", NEEDS_HUMAN_LABEL);
    await repo.add("b", NEEDS_HUMAN_LABEL);
    await repo.add("c", "otra");
    expect(await repo.countByLabel(NEEDS_HUMAN_LABEL)).toBe(2);
  });

  it("labelMeta tiene nombre/color para la etiqueta de sistema", () => {
    const m = labelMeta(NEEDS_HUMAN_LABEL);
    expect(m.name).toBe("Atención humana");
    expect(m.color).toBe("var(--bad)");
    // Desconocida → genérica (no rompe).
    expect(labelMeta("rara").name).toBe("rara");
  });
});
