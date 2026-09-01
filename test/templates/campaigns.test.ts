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
      // Los comentarios se responden en público: ninguna plantilla crea DM.
      expect(["comment_reply", "dm_reply"]).toContain(t.defaults.kind);
    }
  });

  it("getTemplate devuelve la plantilla o undefined", () => {
    expect(getTemplate("link-comentario")?.label).toBe("Link en comentario");
    expect(getTemplate("no-existe")).toBeUndefined();
  });

  it("las plantillas de comentario responden en público (nunca DM)", () => {
    for (const t of CAMPAIGN_TEMPLATES) {
      if (t.defaults.kind === "dm_reply") continue;
      expect(t.defaults.kind).toBe("comment_reply");
      expect(t.defaults.requireFollow).not.toBe(true);
    }
  });
});
