/**
 * El mapa visual de proveedores de scraping (Configuración → Scraping y
 * Registro de scraping): tiene que decir, en lenguaje llano, qué hace Decodo,
 * qué hace AIsa y cuál está trabajando en cada modo.
 */
import { describe, it, expect } from "vitest";
import { renderScrapeProviders, scrapeProviderOf } from "../../src/admin/views/scrapeProviders";
import { makeT } from "../../src/admin/i18n";
import type { Env } from "../../src/env";

const t = makeT("es");
const env = { DECODO_AUTH: "user:pass", AISA_API_KEY: "sk-aisa-1234" } as unknown as Env;

describe("scrapeProviderOf", () => {
  it("normaliza el valor del panel (vacío/basura → auto)", () => {
    expect(scrapeProviderOf({})).toBe("auto");
    expect(scrapeProviderOf({ scrape_provider: "otra-cosa" })).toBe("auto");
    expect(scrapeProviderOf({ scrape_provider: "aisa" })).toBe("aisa");
    expect(scrapeProviderOf({ scrape_provider: "decodo" })).toBe("decodo");
  });
});

describe("renderScrapeProviders", () => {
  it("muestra lo que hace cada proveedor y cuál trabaja en modo AIsa", () => {
    const html = renderScrapeProviders(env, { scrape_provider: "aisa" }, t);

    expect(html).toContain("Decodo");
    expect(html).toContain("AIsa · Firecrawl");
    expect(html).toContain("Trabajando: AIsa");
    expect(html).toContain("EN USO");
    expect(html).toContain("no se usa en esta instalación");
    expect(html).toContain("Solo AIsa");
  });

  it("en modo auto marca a Decodo como primero y a AIsa como respaldo", () => {
    const html = renderScrapeProviders(env, { scrape_provider: "auto" }, t);

    expect(html).toContain("Trabajando: Automático");
    expect(html).toContain("primero en «Auto»");
    expect(html).toContain("respaldo en «Auto»");
    expect(html).toContain("nunca se queda sin leer el sitio");
  });

  it("avisa cuando falta la llave de un proveedor", () => {
    const html = renderScrapeProviders({} as Env, { scrape_provider: "auto" }, t);
    expect(html).toContain("sin llave");
    expect(html).not.toContain("llave lista");
  });
});
