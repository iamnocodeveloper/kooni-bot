import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import { KbDocsRepo } from "../../src/kb/docs";
import { parseWebSyncUrls, webDocId, runWebSync, trimBoilerplate, splitParts, stripMarkdownLinks, rebuildInventoryKb } from "../../src/kb/webSync";
import { loadVehicleStore, saveVehicleStore, mergeVehicleStore, parseDealerInventorySitemap } from "../../src/kb/inventory";
import type { Env } from "../../src/env";

describe("parseWebSyncUrls / webDocId", () => {
  it("acepta URLs por línea o coma, ignora basura, tope 10", () => {
    const urls = parseWebSyncUrls("https://a.com/1\nhttps://b.com/2, no-url ,https://c.com/3");
    expect(urls).toEqual(["https://a.com/1", "https://b.com/2", "https://c.com/3"]);
  });
  it("webDocId es estable, corto y namespaceado", () => {
    const id = webDocId("https://x.com/llm/inventory/?type=used&limit=100");
    expect(id.startsWith("web:")).toBe(true);
    expect(webDocId("https://x.com/llm/inventory/?limit=100&type=used")).toBe(id); // orden de query no importa
  });

  it("trimBoilerplate recorta nav y footer, deja el inventario", () => {
    const raw =
      "- [Home](/)\n- [New](/new)\n- [Used](/used)\n".repeat(30) +
      "### 2022 Kia Sorento\nUsed 34,000 miles $27,900\nVIN: KNDPU3DG4V7430723\n".repeat(40) +
      "\n## Contact Us\n561-555-1234\n" +
      "Your Privacy & Cookies — bla bla\n".repeat(10);
    const out = trimBoilerplate(raw);
    expect(out).toContain("Kia Sorento");
    expect(out).toContain("VIN: KNDPU3DG4V7430723");
    expect(out).not.toContain("[Home](/)");
    expect(out).not.toContain("Contact Us");
    expect(out.length).toBeLessThan(raw.length);
  });

  it("trimBoilerplate no rompe texto sin marcadores", () => {
    const plain = "Este es un texto corto sin precios ni menús.";
    expect(trimBoilerplate(plain)).toBe(plain);
  });

  it("stripMarkdownLinks: deja el texto del link, nunca la URL (el bot no debe mandar links del inventario)", () => {
    const raw =
      "-   [2020 Kia Sorento LX](http://x.com/inventory/used-2020-kia-sorento-lx/) Pre-Owned\n" +
      "    85,110 miles $17,593 VIN: 5XYPG4A38LG625285 [View Full Listing →](http://x.com/inventory/used-2020-kia-sorento-lx/)";
    const out = stripMarkdownLinks(raw);
    expect(out).toContain("2020 Kia Sorento LX");
    expect(out).toContain("View Full Listing →");
    expect(out).toContain("VIN: 5XYPG4A38LG625285");
    expect(out).not.toContain("http://");
    expect(out).not.toContain("(");
  });

  it("stripMarkdownLinks no toca texto sin links", () => {
    const plain = "Kia Sorento 2020, $17,593, VIN: 5XYPG4A38LG625285";
    expect(stripMarkdownLinks(plain)).toBe(plain);
  });

  it("splitParts: un texto corto → 1 parte; uno largo → varias en salto de línea", () => {
    expect(splitParts("hola\nmundo", 100, 8)).toEqual(["hola\nmundo"]);
    const lines = Array.from({ length: 50 }, (_, i) => `linea ${i} con algo de texto`).join("\n");
    const parts = splitParts(lines, 200, 8);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.length).toBeLessThanOrEqual(8);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(200));
    expect(parts.join("\n")).toContain("linea 49");
  });

  it("webDocId nunca genera vectores > 64 bytes (Vectorize los rechaza)", () => {
    const largo =
      "https://www.greenwaykiawestpalmbeach.com/llm/inventory/?limit=100&type=used&bodytype=Cars&page=2&sort=price";
    const id = webDocId(largo);
    // indexDoc genera `dash:<id>#<n>` con n hasta 24 → el peor caso:
    const peor = `dash:${id}#24`;
    expect(Buffer.byteLength(peor, "utf8")).toBeLessThanOrEqual(64);
  });
});

describe("runWebSync", () => {
  let env: Env;
  let db: Db;
  let kbUpsert: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mf = await createTestMiniflare();
    const d1 = (await mf.getD1Database("DB")) as any;
    db = new Db(d1);
    kbUpsert = vi.fn(async () => ({}));
    env = {
      DB: d1,
      DECODO_AUTH: "user:pass",
      KB: { upsert: kbUpsert, deleteByIds: vi.fn(async () => ({})) },
      AI: { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) },
    } as unknown as Env;
  });

  it("omite si falta la API key de Decodo", async () => {
    const r = await runWebSync({ ...env, DECODO_AUTH: undefined } as Env);
    expect(r.skipped).toContain("Decodo");
  });

  it("omite sin URLs configuradas", async () => {
    const r = await runWebSync(env);
    expect(r.skipped).toContain("URLs");
  });

  it("scrapea, guarda como doc web: e indexa; en la 2ª corrida sin cambios no re-indexa", async () => {
    await new SettingsRepo(db).set(SETTING_KEYS.webSyncUrls, "https://x.com/llm/inventory/?type=used");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [{ content: "# Inventario\nKia Rio 2020 $12000", status_code: 200 }] }), { status: 200 })),
    );

    const r1 = await runWebSync(env);
    expect(r1.updated).toBe(1);
    expect(kbUpsert).toHaveBeenCalled();

    const doc = await new KbDocsRepo(db).getById(webDocId("https://x.com/llm/inventory/?type=used"));
    expect(doc?.content).toContain("Kia Rio 2020");

    const r2 = await runWebSync(env);
    expect(r2.unchanged).toBe(1);
    expect(r2.updated).toBe(0);
  });

  it("registra el error y sigue si Decodo falla", async () => {
    await new SettingsRepo(db).set(SETTING_KEYS.webSyncUrls, "https://x.com/a");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const r = await runWebSync(env);
    expect(r.errors).toHaveLength(1);
    expect(r.updated).toBe(0);
  });

  it("un fallo de scrape NO vacía el store de inventario existente", async () => {
    const url = "https://www.greenwaykiawestpalmbeach.com/dealer-inspire-inventory/inventory_sitemap";
    await new SettingsRepo(db).set(SETTING_KEYS.webSyncUrls, url);
    const feed = [
      "<urlset>",
      "https://www.greenwaykiawestpalmbeach.com/inventory/used-2019-ford-f-150-xlt-4wd-4d-supercrew-1ftfw1ef9gfc91150/",
      "https://www.greenwaykiawestpalmbeach.com/inventory/used-2020-kia-sorento-lx-fwd-4d-sport-utility-5xypg4a38lg625285/",
      "https://www.greenwaykiawestpalmbeach.com/inventory/used-2021-toyota-rav4-xle-awd-4d-sport-utility-2t3p1rfv0mw123456/",
      "</urlset>",
    ].join("\n");
    const envInv = {
      ...env,
      AI: {
        run: vi.fn(async (_m: string, input: { text: unknown }) => ({
          data: (Array.isArray(input.text) ? input.text : [input.text]).map(() => [0.1, 0.2, 0.3]),
        })),
      },
    } as unknown as Env;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ content: feed, status_code: 200 }] }), { status: 200 })));
    const r1 = await runWebSync(envInv);
    expect(r1.vehicles).toBe(3);

    // Decodo falla (scrape vacío/500): el store NO debe borrarse.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const r2 = await runWebSync(envInv);
    expect(r2.errors).toHaveLength(1);
    const store = await loadVehicleStore(db);
    expect(Object.keys(store.vehicles)).toHaveLength(3);
  });

  it("rebuildInventoryKb regenera la KB desde el store (con precio) sin scrapear", async () => {
    const feedUrl = "https://www.greenwaykiawestpalmbeach.com/dealer-inspire-inventory/inventory_sitemap";
    const parsed = parseDealerInventorySitemap(
      "<urlset>https://www.greenwaykiawestpalmbeach.com/inventory/used-2020-kia-sorento-lx-fwd-4d-sport-utility-5xypg4a38lg625285/</urlset>",
      feedUrl,
    );
    const store = mergeVehicleStore({ updatedAt: 0, vehicles: {} }, parsed);
    store.vehicles[parsed[0].key].price = 17593;
    await saveVehicleStore(db, store);
    const envInv = {
      ...env,
      AI: {
        run: vi.fn(async (_m: string, input: { text: unknown }) => ({
          data: (Array.isArray(input.text) ? input.text : [input.text]).map(() => [0.1, 0.2, 0.3]),
        })),
      },
    } as unknown as Env;
    const r = await rebuildInventoryKb(envInv, db);
    expect(r.vehicles).toBe(1);
    const doc = await new KbDocsRepo(db).getById(webDocId(feedUrl));
    expect(doc?.content).toContain("2020 Kia Sorento LX");
    expect(doc?.content).toContain("$17,593");
  });

  it("modo inventario: docs compactos sin links + doc resumen + store; 2ª corrida sin cambios no re-embebe", async () => {
    const url = "https://www.greenwaykiawestpalmbeach.com/llm/inventory/";
    await new SettingsRepo(db).set(SETTING_KEYS.webSyncUrls, url);
    const feed = `-   [2022 Kia Telluride SX](https://www.greenwaykiawestpalmbeach.com/inventory/used/2022-kia-telluride-sx) New
    45,210 miles $46,990 VIN: 5XYPH4A56KG123456
-   [2020 Kia Sorento LX](https://www.greenwaykiawestpalmbeach.com/inventory/used/2020-kia-sorento-lx) Pre-Owned
    85,110 miles $17,593 VIN: 5XYPG4A38LG625285
-   [2021 Chevrolet Equinox LT](https://www.greenwaykiawestpalmbeach.com/inventory/used/2021-chevrolet-equinox-lt) Used
    33,004 miles $21,400 VIN: 2GNAXKEV9M6123456
-   [2022 Toyota Camry SE](https://www.greenwaykiawestpalmbeach.com/inventory/used/2022-toyota-camry-se) Certified
    22,100 miles $28,990 VIN: 4T1G11AK8NU123456`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [{ content: feed, status_code: 200 }] }), { status: 200 })),
    );
    // AI mock adaptativo: indexDoc embebe por lote (varios chunks por corrida).
    const envInv = {
      ...env,
      AI: {
        run: vi.fn(async (_model: string, input: { text: unknown }) => ({
          data: (Array.isArray(input.text) ? input.text : [input.text]).map(() => [0.1, 0.2, 0.3]),
        })),
      },
    } as unknown as Env;

    const r1 = await runWebSync(envInv);
    expect(r1.updated).toBe(1);
    expect(r1.vehicles).toBe(4);
    expect(r1.imagesPending).toBe(4);

    const id = webDocId(url);
    const doc = await new KbDocsRepo(db).getById(id);
    expect(doc?.content).toContain("2020 Kia Sorento LX");
    expect(doc?.content).toContain("$17,593");
    expect(doc?.content).not.toMatch(/https?:\/\//);

    // Doc resumen con marcas reales + reglas (lo que responde "¿qué marcas tienen?").
    const sum = await new KbDocsRepo(db).getById(`${id}-resumen`);
    expect(sum?.content).toContain("Marcas disponibles: Kia (2), Chevrolet (1), Toyota (1)");
    expect(sum?.content).toContain("REGLAS");

    const store = await loadVehicleStore(db);
    expect(Object.keys(store.vehicles)).toHaveLength(4);
    const sorento = Object.values(store.vehicles).find((v) => v.vin === "5XYPG4A38LG625285");
    expect(sorento?.listingUrl).toContain("2020-kia-sorento-lx");

    // Sin cambios → no re-embebe ni pisa el store.
    const r2 = await runWebSync(envInv);
    expect(r2.unchanged).toBe(1);
    expect(r2.updated).toBe(0);
    expect((await loadVehicleStore(db)).vehicles).toHaveProperty(sorento!.key);
  });

  it("modo texto (no inventario) se mantiene sin store ni resumen", async () => {
    await new SettingsRepo(db).set(SETTING_KEYS.webSyncUrls, "https://x.com/faq");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [{ content: "### Horarios\nLun a Vie 9-18.", status_code: 200 }] }), { status: 200 })),
    );
    const envTxt = {
      ...env,
      AI: {
        run: vi.fn(async (_model: string, input: { text: unknown }) => ({
          data: (Array.isArray(input.text) ? input.text : [input.text]).map(() => [0.1, 0.2, 0.3]),
        })),
      },
    } as unknown as Env;
    const r = await runWebSync(envTxt);
    expect(r.updated).toBe(1);
    expect(r.vehicles).toBeUndefined();
    const sum = await new KbDocsRepo(db).getById(`${webDocId("https://x.com/faq")}-resumen`);
    expect(sum).toBeNull();
    expect(Object.keys((await loadVehicleStore(db)).vehicles)).toHaveLength(0);
  });
});
