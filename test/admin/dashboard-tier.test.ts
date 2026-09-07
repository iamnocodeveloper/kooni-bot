import { describe, it, expect } from "vitest";
import { layout } from "../../src/admin/views/layout";
import { makeDb, testLicense } from "../helpers/license";
import type { Env } from "../../src/env";

const envOf = (tier: "free" | "pro") =>
  tier === "pro"
    ? ({ DB: makeDb({ pro_license: testLicense.code }), LICENSE_PUBLIC_KEY: testLicense.pub } as unknown as Env)
    : ({ DB: makeDb({}) } as unknown as Env);
const page = async (tier: "free" | "pro") =>
  await layout({ title: "Test", activeTab: "overview", body: "<p>body</p>", env: envOf(tier) });

// MODELO (2026-09-07): sin gate por feature. TODAS las secciones del panel
// están disponibles en free y en Pro; solo cambian los límites de cantidad.
describe("dashboard nav — sin tabs bloqueados", () => {
  it("free: TODAS las secciones linkean a su vista real", async () => {
    const html = await page("free");
    for (const href of [
      "/admin/insights",
      "/admin/stats",
      "/admin/costs",
      "/admin/mejoras",
      "/admin/campanas",
      "/admin/conversations",
      "/admin/leads",
      "/admin/kb",
      "/admin/conexiones",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("free: no hay link de upgrade en el nav", async () => {
    const html = await page("free");
    expect(html).not.toContain('href="/admin/upgrade"');
  });

  it("pro: igual que free — todas las secciones accesibles", async () => {
    const html = await page("pro");
    for (const href of ["/admin/insights", "/admin/stats", "/admin/costs", "/admin/mejoras", "/admin/campanas"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toContain('href="/admin/upgrade"');
  });

  it("el badge del plan refleja el tier (Free / Pro)", async () => {
    expect(await page("free")).toContain("Free");
    expect(await page("pro")).toContain("Pro");
  });

  it("sin env (fallback): todo abierto", async () => {
    const html = await layout({ title: "T", activeTab: "overview", body: "x" });
    expect(html).toContain('href="/admin/insights"');
  });
});
