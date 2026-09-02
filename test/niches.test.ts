import { describe, it, expect } from "vitest";
import { getNiche } from "../src/niches";
import { systemPromptFromEnv } from "../src/system-prompt";
import { layout } from "../src/admin/views/layout";
import type { Env } from "../src/env";

const envWith = (niche?: string) => ({ BOT_NICHE: niche, BOT_NAME: "Bot", BUSINESS_NAME: "Neg", BOT_LANGUAGE: "es-MX" }) as unknown as Env;

describe("getNiche", () => {
  it("nicho ausente o desconocido → genérico (comportamiento del Starter)", () => {
    for (const v of [undefined, "", "xyz", "restaurante"]) {
      const n = getNiche(envWith(v));
      expect(n.id).toBe("generico");
      expect(n.navLabel).toBe("Leads");
      expect(n.playbook).toBe("");
      expect(n.defaultTone).toBe("");
    }
  });

  it("normaliza mayúsculas/espacios al resolver el pack", () => {
    expect(getNiche(envWith("  GENERICO ")).id).toBe("generico");
  });

  it("agencia-ia: resuelve el pack y trae playbook + etiquetas propias", () => {
    const n = getNiche(envWith("agencia-ia"));
    expect(n.id).toBe("agencia-ia");
    expect(n.navLabel).toBe("Prospectos");
    expect(n.playbook).toContain("playbook_de_venta");
    expect(n.defaultTone).not.toBe("");
    expect(n.columns.map((c) => c.key)).toEqual(["servicio", "plan", "canal"]);
  });
});

describe("dashboard (nav genérico)", () => {
  const page = async (niche?: string) => await layout({ title: "T", activeTab: "leads", body: "x", env: envWith(niche) });

  it("genérico: el nav dice 'Leads'", async () => {
    const html = await page(undefined);
    expect(html).toContain("Leads");
    expect(html).toContain('href="/admin/leads"');
  });
});

describe("cableado del playbook al prompt", () => {
  it("genérico no inyecta playbook", () => {
    const env = envWith(undefined);
    const prompt = systemPromptFromEnv(env, ["searchKb"], "ctx", getNiche(env).playbook || undefined);
    expect(prompt).not.toContain("<diagnostic_playbooks>");
  });

  it("agencia-ia inyecta su playbook de venta en el prompt", () => {
    const env = envWith("agencia-ia");
    const prompt = systemPromptFromEnv(env, ["searchKb", "captureLead"], "ctx", getNiche(env).playbook || undefined);
    expect(prompt).toContain("<playbook_de_venta>");
    expect(prompt).toContain("captureLead");
    expect(prompt).toContain("WhatsApp");
  });
});
