import { describe, it, expect } from "vitest";
import { adminApp } from "../../src/admin/routes";
import { manifest, serviceWorker, iconSvg, pwaHeadTags } from "../../src/admin/pwa";
import type { Env } from "../../src/env";

const env = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }) }) },
  DASHBOARD_PASSWORD: "x",
  BUSINESS_NAME: "Test Biz",
  BOT_LANGUAGE: "es",
  BOT_TIER: "pro",
} as unknown as Env;

const req = (path: string, init?: RequestInit) => new Request(`https://bot.test${path}`, init);

describe("pwa module", () => {
  it("manifest: standalone, scope /admin/, ícono svg", () => {
    const m = JSON.parse(manifest(env));
    expect(m.display).toBe("standalone");
    expect(m.scope).toBe("/admin/");
    expect(m.start_url).toBe("/admin/overview");
    expect(m.icons[0].src).toBe("/admin/icon.svg");
  });

  it("marca blanca: el nombre sale de BRAND_NAME", () => {
    const m = JSON.parse(manifest({ ...env, BRAND_NAME: "Acme" } as Env));
    expect(m.name).toContain("Acme");
    expect(m.short_name).toBe("Acme");
  });

  it("service worker: cachea navegaciones y trae handlers de push", () => {
    const sw = serviceWorker();
    expect(sw).toContain("addEventListener('fetch'");
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain("addEventListener('notificationclick'");
    expect(sw).toContain("/admin/overview");
  });

  it("icon.svg: es SVG con el color de acento", () => {
    expect(iconSvg(env)).toContain("<svg");
    expect(iconSvg({ ...env, BRAND_PRIMARY: "#ff0000" } as Env)).toContain("#ff0000");
  });

  it("head tags: enlaza manifest, theme-color y registra el SW", () => {
    const h = pwaHeadTags(env);
    expect(h).toContain('rel="manifest"');
    expect(h).toContain("theme-color");
    expect(h).toContain("navigator.serviceWorker.register('/admin/sw.js'");
  });
});

describe("pwa routes (públicas, sin auth)", () => {
  it("GET /admin/manifest.webmanifest → 200 JSON de manifest", async () => {
    const res = await adminApp.fetch(req("/manifest.webmanifest"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("manifest");
    expect(((await res.json()) as { scope: string }).scope).toBe("/admin/");
  });

  it("GET /admin/sw.js → 200 con Service-Worker-Allowed", async () => {
    const res = await adminApp.fetch(req("/sw.js"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(res.headers.get("service-worker-allowed")).toBe("/admin/");
  });

  it("GET /admin/icon.svg → 200 image/svg+xml", async () => {
    const res = await adminApp.fetch(req("/icon.svg"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
  });
});
