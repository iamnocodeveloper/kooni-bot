import { describe, it, expect } from "vitest";
import { buttonChipHtml } from "../../src/admin/views/conversations";

describe("buttonChipHtml (hilo de conversaciones — §V Fase 3)", () => {
  it("sin botones: no renderiza nada", () => {
    expect(buttonChipHtml([])).toBe("");
  });

  it("botón de tipo url: link real clicable", () => {
    const html = buttonChipHtml([{ label: "Ver catálogo", kind: "url", value: "https://ejemplo.com/catalogo" }]);
    expect(html).toContain('<a href="https://ejemplo.com/catalogo"');
    expect(html).toContain("target=\"_blank\"");
    expect(html).toContain("Ver catálogo");
  });

  it("botón de tipo callback: chip informativo, no un <a>", () => {
    const html = buttonChipHtml([{ label: "Agendar", kind: "callback", value: "agendar_click" }]);
    expect(html).not.toContain("<a ");
    expect(html).toContain("Agendar");
  });

  it("escapa el label y la url (sin XSS)", () => {
    const html = buttonChipHtml([{ label: "<script>alert(1)</script>", kind: "url", value: 'https://x.test/"onmouseover=alert(1)' }]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('"onmouseover=alert(1)');
  });

  it("varios botones se concatenan", () => {
    const html = buttonChipHtml([
      { label: "A", kind: "url", value: "https://a.test" },
      { label: "B", kind: "callback", value: null },
    ]);
    expect(html.match(/(<a |<span )/g)?.length).toBe(2);
  });
});
