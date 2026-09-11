import { describe, it, expect, vi, afterEach } from "vitest";
import { decodoConfigured, scrapeUrl, resolveDecodoAuth } from "../../src/integrations/decodo";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import type { Env } from "../../src/env";

const env = (over: Partial<Env> = {}) => ({ ...over }) as unknown as Env;

afterEach(() => vi.restoreAllMocks());

describe("decodoConfigured", () => {
  it("false sin DECODO_AUTH", async () => {
    expect(await decodoConfigured(env())).toBe(false);
  });
  it("true con user:pass o con base64", async () => {
    expect(await decodoConfigured(env({ DECODO_AUTH: "user:pass" }))).toBe(true);
    expect(await decodoConfigured(env({ DECODO_AUTH: "dXNlcjpwYXNz" }))).toBe(true);
  });
});

describe("resolveDecodoAuth (panel sobre secret)", () => {
  it("la key del panel gana; vacía → cae al secret del worker", async () => {
    const mf = await createTestMiniflare();
    const d1 = await mf.getD1Database("DB");
    const db = new Db(d1 as any);
    const e = { DB: d1, DECODO_AUTH: "worker:secret" } as unknown as Env;
    expect(await resolveDecodoAuth(e)).toBe("worker:secret");

    await new SettingsRepo(db).set(SETTING_KEYS.decodoAuth, "panel:key");
    expect(await resolveDecodoAuth(e)).toBe("panel:key");

    await new SettingsRepo(db).set(SETTING_KEYS.decodoAuth, "");
    expect(await resolveDecodoAuth(e)).toBe("worker:secret");
    // Instalación limpia (sin secret ni setting) → null (scraping apagado).
    expect(await resolveDecodoAuth({ DB: d1 } as unknown as Env)).toBeNull();
  });
});

describe("scrapeUrl", () => {
  it("devuelve el markdown del primer result", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(
          JSON.stringify({ results: [{ content: "# Inventario\n- Kia Rio 2020 $12000", status_code: 200 }] }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await scrapeUrl(env({ DECODO_AUTH: "user:pass" }), "https://x.com/llm/inventory/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("Kia Rio 2020");

    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ url: "https://x.com/llm/inventory/", markdown: true, headless: "html" });
    expect(init.headers.Authorization).toMatch(/^Basic /);
  });

  it("permite pedir HTML (markdown: false) — para leer og:image de fichas", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(
          JSON.stringify({ results: [{ content: "<html><meta property=\"og:image\" content=\"https://cdn/x.jpg\"></html>", status_code: 200 }] }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await scrapeUrl(env({ DECODO_AUTH: "user:pass" }), "https://x.com/vehicle/1", { markdown: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("og:image");

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.markdown).toBe(false);
  });

  it("ok:false si no hay auth, si el HTTP falla o si viene vacío", async () => {
    expect((await scrapeUrl(env(), "https://x.com")).ok).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 429 })));
    expect((await scrapeUrl(env({ DECODO_AUTH: "u:p" }), "https://x.com")).ok).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ content: "" }] }), { status: 200 })));
    expect((await scrapeUrl(env({ DECODO_AUTH: "u:p" }), "https://x.com")).ok).toBe(false);
  });
});
