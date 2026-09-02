import { describe, it, expect, vi, afterEach } from "vitest";
import { decodoConfigured, scrapeUrl } from "../../src/integrations/decodo";
import type { Env } from "../../src/env";

const env = (over: Partial<Env> = {}) => ({ ...over }) as unknown as Env;

afterEach(() => vi.restoreAllMocks());

describe("decodoConfigured", () => {
  it("false sin DECODO_AUTH", () => {
    expect(decodoConfigured(env())).toBe(false);
  });
  it("true con user:pass o con base64", () => {
    expect(decodoConfigured(env({ DECODO_AUTH: "user:pass" }))).toBe(true);
    expect(decodoConfigured(env({ DECODO_AUTH: "dXNlcjpwYXNz" }))).toBe(true);
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

  it("ok:false si no hay auth, si el HTTP falla o si viene vacío", async () => {
    expect((await scrapeUrl(env(), "https://x.com")).ok).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 429 })));
    expect((await scrapeUrl(env({ DECODO_AUTH: "u:p" }), "https://x.com")).ok).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ content: "" }] }), { status: 200 })));
    expect((await scrapeUrl(env({ DECODO_AUTH: "u:p" }), "https://x.com")).ok).toBe(false);
  });
});
