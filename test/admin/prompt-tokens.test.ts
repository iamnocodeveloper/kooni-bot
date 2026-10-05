import { describe, it, expect } from "vitest";
import { renderPromptInsertBar, PROMPT_TOKEN_NAMES } from "../../src/admin/views/prompt-tokens";
import { SUPPORTED_PROMPT_TOKENS } from "../../src/system-prompt";
import { makeT } from "../../src/admin/i18n";

describe("renderPromptInsertBar (prompt manual)", () => {
  it("incluye los chips de etiquetas, las herramientas y el menú '/'", () => {
    const html = renderPromptInsertBar(makeT("es"), "system_prompt_override", [
      "searchKb",
      "scheduleAppointment",
    ]);
    expect(html).toContain("{{BUSINESS_CONTEXT}}");
    expect(html).toContain("{{TOOL_LIST}}");
    expect(html).toContain("searchKb");
    expect(html).toContain("scheduleAppointment");
    // Contenedor del menú + datos que consume el motor del layout.
    expect(html).toContain('data-pt-menu="system_prompt_override"');
    expect(html).toContain("window.__ptData");
    expect(html).toContain("data-pt-insert=");
  });

  it("cada etiqueta del catálogo aparece como chip", () => {
    const html = renderPromptInsertBar(makeT("en"), "x", []);
    for (const tok of PROMPT_TOKEN_NAMES) expect(html).toContain(tok);
  });

  it("todas las etiquetas de la barra son sustituibles por el worker", () => {
    for (const raw of PROMPT_TOKEN_NAMES) {
      const name = raw.replace(/[{}]/g, "");
      expect(SUPPORTED_PROMPT_TOKENS).toContain(name);
    }
  });
});
