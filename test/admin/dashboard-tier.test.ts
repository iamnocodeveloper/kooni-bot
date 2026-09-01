import { describe, it, expect } from "vitest";
import { layout, renderUpgrade } from "../../src/admin/views/layout";
import { makeDb, testLicense } from "../helpers/license";
import type { Env } from "../../src/env";

const envOf = (tier: "free" | "pro") =>
  tier === "pro"
    ? { DB: makeDb({ pro_license: testLicense.code }), LICENSE_PUBLIC_KEY: testLicense.pub } as unknown as Env
    : ({ DB: makeDb({}) } as unknown as Env);
const page = async (tier: "free" | "pro") =>
  await layout({ title: "Test", activeTab: "overview", body: "<p>body</p>", env: envOf(tier) });

describe("dashboard tier gating (nav)", () => {
  it("free: los tabs Pro salen bloqueados y apuntan a /admin/upgrade", async () => {
    const html = await page("free");
    // El item Pro (ej. Insights) no linkea a su vista real, sino al upgrade.
    expect(html).not.toContain('href="/admin/insights"');
    expect(html).toContain('href="/admin/upgrade"');
    expect(html).toContain("PRO"); // badge en el item bloqueado
    expect(html).toContain("Panel · Free");
  });

  it("free: los tabs básicos siguen accesibles", async () => {
    const html = await page("free");
    for (const href of ["/admin/conversations", "/admin/leads", "/admin/kb", "/admin/conexiones"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("pro: todos los tabs linkean a su vista real, sin badge PRO", async () => {
    const html = await page("pro");
    for (const href of ["/admin/insights", "/admin/stats", "/admin/costs", "/admin/mejoras", "/admin/campanas"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain("Panel · Pro");
    expect(html).not.toContain('href="/admin/upgrade"');
  });

  it("sin env (fallback) asume Pro — no oculta nada", async () => {
    const html = await layout({ title: "T", activeTab: "overview", body: "x" });
    expect(html).toContain('href="/admin/insights"');
  });

  it("renderUpgrade arma la página y NO expone la nota interna de tier", async () => {
    const html = await renderUpgrade(envOf("free"), "Insights");
    expect(html).toContain("Insights");
    // La instrucción de infraestructura (BOT_TIER/wrangler.toml) NO debe llegar
    // al cliente: el upgrade debe dirigir a la página de Licencia.
    expect(html).not.toContain("BOT_TIER");
    expect(html).not.toContain("wrangler.toml");
    expect(html).toContain('href="/admin/licencia"');
  });
});
