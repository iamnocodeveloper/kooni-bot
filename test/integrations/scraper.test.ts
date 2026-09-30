import { describe, it, expect, vi, afterEach } from "vitest";
import { scrapeForFeed, resolveScrapeProvider } from "../../src/integrations/scraper";

// El conmutador es lógica pura + fetch: se puede probar sin DB (sin DB cae a
// `auto` y a las keys de env). Cubre los tres caminos: directo, AIsa y Decodo.
const SITEMAP = "https://www.greenwaykiawestpalmbeach.com/dealer-inspire-inventory/inventory_sitemap";
const XML = `<?xml version="1.0"?><urlset><url><loc>https://x/inventory/used-2020-kia-sorento-lx/</loc></url></urlset>`;

afterEach(() => vi.restoreAllMocks());

describe("scrapeForFeed — elección de fuente", () => {
  it("sitemap + directo devuelve XML → usa el directo (sin gastar proveedor)", async () => {
    globalThis.fetch = vi.fn(async () => new Response(XML, { status: 200 })) as any;
    const r = await scrapeForFeed({} as any, SITEMAP);
    expect(r.ok).toBe(true);
    expect(r.source).toBe("directo");
  });

  it("sitemap + directo devuelve HTML (challenge 200) → NO lo acepta y cae al proveedor", async () => {
    // GET (directo) → challenge HTML con 200; POST (Decodo) → su forma { results:[…] }.
    globalThis.fetch = vi.fn(async (_url: any, init?: any) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ results: [{ content: XML, status_code: 200 }] }), { status: 200 })
        : new Response("<html><title>Just a moment…</title></html>", { status: 200 }),
    ) as any;
    const r = await scrapeForFeed({ DECODO_AUTH: "user:pass" } as any, SITEMAP);
    expect(r.ok).toBe(true);
    expect(r.source).toBe("decodo");
    expect(r.content).toContain("<urlset");
  });

  it("con provider aisa y key, usa Firecrawl (no Decodo)", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ success: true, data: { markdown: "# ficha\n$20,000" } }), { status: 200 });
    }) as any;
    const r = await scrapeForFeed({ AISA_API_KEY: "sk-test" } as any, "https://x.com/faq");
    expect(r.ok).toBe(true);
    expect(r.source).toBe("aisa");
    expect(r.content).toContain("$20,000");
    expect(calls[0]).toContain("/apis/v1/firecrawl/scrape");
  });

  it("sitemap + provider aisa → usa firecrawl/map y sintetiza el XML", async () => {
    globalThis.fetch = vi.fn(async (url: any) => {
      // 1º el directo (falla con HTML), 2º el map de AIsa.
      if (String(url).includes("/firecrawl/map")) {
        return new Response(
          JSON.stringify({
            success: true,
            links: [
              { url: "https://x/inventory/new-2026-kia-k5-gt-line-fwd-knag64j73t1000001/" },
              { url: "https://x/about" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("<html>challenge</html>", { status: 200 });
    }) as any;
    const r = await scrapeForFeed({ AISA_API_KEY: "sk-test" } as any, SITEMAP);
    expect(r.ok).toBe(true);
    expect(r.source).toBe("aisa-map");
    expect(r.content).toContain("<urlset");
    expect(r.content).toContain("knag64j73t1000001");
    expect(r.content).not.toContain("/about"); // solo fichas de inventario
  });

  it("decodo por defecto y error propagado", async () => {
    globalThis.fetch = vi.fn(async () => new Response("boom", { status: 500 })) as any;
    const r = await scrapeForFeed({ DECODO_AUTH: "user:pass" } as any, "https://x.com/a");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe("resolveScrapeProvider", () => {
  it("sin DB y sin setting → auto", async () => {
    expect(await resolveScrapeProvider({} as any)).toBe("auto");
  });
});
