import { describe, it, expect } from "vitest";
import { CAMPAIGN_TEMPLATES, getTemplate } from "../../src/templates/campaigns";

describe("CAMPAIGN_TEMPLATES", () => {
  it("cada plantilla tiene id único, label, desc y defaults válidos", () => {
    const ids = new Set<string>();
    for (const t of CAMPAIGN_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.desc.length).toBeGreaterThan(0);
      expect(t.defaults.keywords.length).toBeGreaterThan(0);
      expect(t.defaults.message.length).toBeGreaterThan(0);
      expect(["comment_dm", "comment_reply", "dm_reply"]).toContain(t.defaults.kind);
    }
  });

  it("getTemplate devuelve la plantilla o undefined", () => {
    expect(getTemplate("link-comentario")?.label).toBe("Link en comentario");
    expect(getTemplate("no-existe")).toBeUndefined();
  });

  it("la plantilla de follow gate trae requireFollow con mensajes", () => {
    const tpl = getTemplate("oferta-follow-gate");
    expect(tpl?.defaults.requireFollow).toBe(true);
    expect(tpl?.defaults.followPromptMessage).toContain("{username}");
    expect(tpl?.defaults.followButtonLabel).toBeTruthy();
  });
});
