import { describe, it, expect } from "vitest";
import { getNiche } from "../src/niches";
import { systemPromptFromEnv } from "../src/system-prompt";
import { layout } from "../src/admin/views/layout";
import type { Env } from "../src/env";

const envWith = (niche?: string) => ({ BOT_NICHE: niche, BOT_NAME: "Bot", BUSINESS_NAME: "Neg", BOT_LANGUAGE: "es-MX" }) as unknown as Env;

// Packs por giro registrados en src/niches/index.ts. Al agregar un giro nuevo,
// suma su fila aquí: cubre resolución, re-etiquetado del panel, columnas y el
// tag de su playbook.
const GIROS: {
  id: string;
  navLabel: string;
  recordPlural: string;
  statusNew: string;
  playbookTag: string;
  columns: string[];
}[] = [
  { id: "agencia-ia", navLabel: "Prospectos", recordPlural: "Prospectos", statusNew: "Nuevo", playbookTag: "playbook_de_venta", columns: ["servicio", "plan", "canal"] },
  { id: "restaurante", navLabel: "Reservaciones", recordPlural: "Reservaciones", statusNew: "Solicitada", playbookTag: "playbook_restaurante", columns: ["fecha", "hora", "personas", "ocasion"] },
  { id: "inmobiliaria", navLabel: "Prospectos", recordPlural: "Prospectos", statusNew: "Nuevo", playbookTag: "playbook_inmobiliaria", columns: ["operacion", "zona", "presupuesto", "recamaras"] },
  { id: "clinica", navLabel: "Citas", recordPlural: "Citas", statusNew: "Solicitada", playbookTag: "playbook_clinica", columns: ["especialidad", "fecha", "hora", "motivo"] },
  { id: "barberia", navLabel: "Citas", recordPlural: "Citas", statusNew: "Solicitada", playbookTag: "playbook_barberia", columns: ["servicio", "barbero", "fecha", "hora"] },
];

describe("getNiche", () => {
  it("nicho ausente o desconocido → genérico (comportamiento del Starter)", () => {
    for (const v of [undefined, "", "xyz", "giro-inexistente"]) {
      const n = getNiche(envWith(v));
      expect(n.id).toBe("generico");
      expect(n.navLabel).toBe("Leads");
      expect(n.playbook).toBe("");
      expect(n.defaultTone).toBe("");
    }
  });

  it("normaliza mayúsculas/espacios al resolver el pack", () => {
    expect(getNiche(envWith("  GENERICO ")).id).toBe("generico");
    expect(getNiche(envWith(" Restaurante ")).id).toBe("restaurante");
  });

  it.each(GIROS)("$id: resuelve el pack, re-etiqueta el panel y trae playbook + columnas", (g) => {
    const n = getNiche(envWith(g.id));
    expect(n.id).toBe(g.id);
    expect(n.navLabel).toBe(g.navLabel);
    expect(n.recordPlural).toBe(g.recordPlural);
    expect(n.statusLabels.new).toBe(g.statusNew);
    expect(n.playbook).toContain(g.playbookTag);
    expect(n.defaultTone).not.toBe("");
    expect(n.columns.map((c) => c.key)).toEqual(g.columns);
    // Cada columna tiene label y las 4 etiquetas de estado están definidas.
    for (const c of n.columns) expect(c.label.length).toBeGreaterThan(0);
    for (const s of ["new", "contacted", "sold", "lost"] as const) expect(n.statusLabels[s]).toBeTruthy();
  });
});

describe("dashboard (nav genérico)", () => {
  const page = async (niche?: string) => await layout({ title: "T", activeTab: "leads", body: "x", env: envWith(niche) });

  it("genérico: el nav dice 'Leads'", async () => {
    const html = await page(undefined);
    expect(html).toContain("Leads");
    expect(html).toContain('href="/admin/leads"');
  });

  it.each(GIROS)("$id: el nav re-etiqueta 'Leads' → '$navLabel'", async (g) => {
    const html = await page(g.id);
    expect(html).toContain(g.navLabel);
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

  it.each(GIROS.filter((g) => g.id !== "agencia-ia"))("$id inyecta su playbook en el prompt generado", (g) => {
    const env = envWith(g.id);
    const prompt = systemPromptFromEnv(env, ["searchKb", "captureLead", "handoffHuman"], "ctx", getNiche(env).playbook || undefined);
    expect(prompt).toContain(`<${g.playbookTag}>`);
    expect(prompt).toContain("captureLead");
    expect(prompt).toContain("searchKb");
  });
});
