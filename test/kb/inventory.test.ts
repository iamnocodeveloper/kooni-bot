import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import {
  parseInventory,
  parseInventoryFromAny,
  parseDealerInventorySitemap,
  vehicleFromSlug,
  splitBlocks,
  renderInventoryParts,
  renderInventorySummary,
  renderVehicleBlock,
  extractImageFromMarkdown,
  extractImageFromHtml,
  extractDetailsFromHtml,
  extractPriceFromText,
  extractMilesFromText,
  mergeVehicleStore,
  loadVehicleStore,
  saveVehicleStore,
  imageCandidates,
  ensureVehicleImage,
  queryInventory,
} from "../../src/kb/inventory";
import type { Env } from "../../src/env";

const FEED = `-   [2022 Kia Telluride SX](https://www.greenwaykiawestpalmbeach.com/inventory/used/2022-kia-telluride-sx) New
    45,210 miles $46,990 VIN: 5XYPH4A56KG123456
-   [2020 Kia Sorento LX](https://www.greenwaykiawestpalmbeach.com/inventory/used/2020-kia-sorento-lx) Pre-Owned
    85,110 miles $17,593 VIN: 5XYPG4A38LG625285
-   [2021 Chevrolet Equinox LT](https://www.greenwaykiawestpalmbeach.com/inventory/used/2021-chevrolet-equinox-lt) Used
    33,004 miles $21,400 VIN: 2GNAXKEV9M6123456
-   [2023 Kia Forte GT](https://www.greenwaykiawestpalmbeach.com/used/2023-kia-forte-gt) Used 18,200 miles $24,750 VIN: 3KPF24AD1PE123456
-   [2022 Toyota Camry SE](https://www.greenwaykiawestpalmbeach.com/inventory/used/2022-toyota-camry-se) Certified
    22,100 miles $28,990 VIN: 4T1G11AK8NU123456`;

afterEach(() => vi.restoreAllMocks());

describe("parseInventory", () => {
  it("parsea autos del feed: título, precio, millas, VIN, condición y URL de ficha", () => {
    const vs = parseInventory(FEED, "https://www.greenwaykiawestpalmbeach.com/llm/inventory/");
    expect(vs.length).toBe(5);

    const sorento = vs.find((v) => v.vin === "5XYPG4A38LG625285");
    expect(sorento).toMatchObject({
      title: "2020 Kia Sorento LX",
      make: "Kia",
      model: "Sorento LX",
      year: 2020,
      price: 17593,
      miles: 85110,
      condition: "Usado",
      listingUrl: "https://www.greenwaykiawestpalmbeach.com/inventory/used/2020-kia-sorento-lx",
    });

    const telluride = vs.find((v) => v.vin === "5XYPH4A56KG123456");
    expect(telluride?.condition).toBe("Nuevo");
    const camry = vs.find((v) => v.vin === "4T1G11AK8NU123456");
    expect(camry?.condition).toBe("Certificado");
  });

  it("dedupe por VIN y resuelve URLs relativas", () => {
    const rel = `-   [2022 Kia Sportage](/inventory/2022-kia-sportage) Used $24,000 VIN: KNDPMCAC0N7123456
-   [2022 Kia Sportage](/inventory/2022-kia-sportage) Used $24,000 VIN: KNDPMCAC0N7123456`;
    const vs = parseInventory(rel, "https://www.greenwaykiawestpalmbeach.com/llm/inventory/");
    expect(vs).toHaveLength(1);
    expect(vs[0].listingUrl).toBe("https://www.greenwaykiawestpalmbeach.com/inventory/2022-kia-sportage");
  });

  it("no parsea texto que no parece inventario (vuelve [])", () => {
    const plain = "### Sobre nosotros\nSomos un concesionario. [Contacto](/contacto) $12";
    expect(parseInventory(plain, "https://x.com")).toEqual([]);
  });

  it("ignora CTAs repetidos como 'View Full Listing'", () => {
    const feed = `-   [View Full Listing →](https://x.com/a) $17,593 VIN: 5XYPG4A38LG625285
    No title link here`;
    // Sin título de auto parseable no entra como vehículo con identidad (no VIN en
    // el título), pero el bloque sí tiene VIN — se arma igual con título VIN.
    const vs = parseInventory(feed, "https://x.com");
    expect(vs.length).toBe(1);
    expect(vs[0].vin).toBe("5XYPG4A38LG625285");
    expect(vs[0].title).toContain("VIN");
  });

  it("toma el link del TÍTULO, no un CTA/nav que aparezca antes en el bloque", () => {
    // Bug: el link de la ficha se tomaba por posición (primer pathname largo)
    // y podía quedar un CTA genérico ("View Full Listing") que apunta a una
    // lista, en vez del link del título que sí es la ficha del auto.
    const feed = `-   [View Full Listing →](https://x.com/lista-generica) Used $21,400 VIN: 2GNAXKEV9M6123456
    [2021 Chevrolet Equinox LT](https://x.com/inventory/used/2021-chevrolet-equinox-lt)`;
    const vs = parseInventory(feed, "https://x.com/llm/inventory/");
    expect(vs).toHaveLength(1);
    expect(vs[0].title).toBe("2021 Chevrolet Equinox LT");
    expect(vs[0].listingUrl).toBe("https://x.com/inventory/used/2021-chevrolet-equinox-lt");
  });

  it("splitBlocks separa por bullets a nivel 0-2, respeta la continuación indentada", () => {
    const blocks = splitBlocks(FEED);
    expect(blocks.length).toBe(5);
    expect(blocks[1]).toContain("VIN: 5XYPG4A38LG625285");
  });
});

describe("sitemap DealerInspire (fuente cuando /llm/inventory/ murió)", () => {
  const SITEMAP = `[https://www.greenwaykiawestpalmbeach.com/inventory/new-2025-kia-telluride-sx-x-line-awd-4d-sport-utility-5xyp5dgc5sg712394/](https://www.greenwaykiawestpalmbeach.com/inventory/new-2025-kia-telluride-sx-x-line-awd-4d-sport-utility-5xyp5dgc5sg712394/)0 2026-09-08 23:13 -05:00
[https://www.greenwaykiawestpalmbeach.com/inventory/used-2019-hyundai-santa-fe-sel-fwd-4d-sport-utility-5nms33ad3kh127914/](https://www.greenwaykiawestpalmbeach.com/inventory/used-2019-hyundai-santa-fe-sel-fwd-4d-sport-utility-5nms33ad3kh127914/)0 2026-09-08 23:13 -05:00
[https://www.greenwaykiawestpalmbeach.com/inventory/certified-used-2023-kia-sorento-sx-awd-4d-sport-utility-5xyrkdlf7pg242135/](https://www.greenwaykiawestpalmbeach.com/inventory/certified-used-2023-kia-sorento-sx-awd-4d-sport-utility-5xyrkdlf7pg242135/)0 2026-09-08 23:13 -05:00
<urlset><url><loc>https://www.greenwaykiawestpalmbeach.com/inventory/used-2016-ford-f-150-xlt-4wd-4d-supercrew-1ftfw1ef9gfc91150/</loc></url></urlset>`;

  it("parsea condición, año, marca, modelo, VIN y el link real de cada ficha", () => {
    const vs = parseDealerInventorySitemap(SITEMAP, "https://www.greenwaykiawestpalmbeach.com/dealer-inspire-inventory/inventory_sitemap");
    expect(vs).toHaveLength(4);

    const telluride = vs.find((v) => v.vin === "5XYP5DGC5SG712394")!;
    expect(telluride).toMatchObject({
      condition: "Nuevo",
      year: 2025,
      make: "Kia",
      price: null,
      listingUrl:
        "https://www.greenwaykiawestpalmbeach.com/inventory/new-2025-kia-telluride-sx-x-line-awd-4d-sport-utility-5xyp5dgc5sg712394/",
    });
    expect(telluride.title).toBe("2025 Kia Telluride SX X Line AWD");

    expect(vs.find((v) => v.vin === "5NMS33AD3KH127914")?.condition).toBe("Usado");
    expect(vs.find((v) => v.vin === "5XYRKDLF7PG242135")?.condition).toBe("Certificado");
    expect(vs.find((v) => v.vin === "1FTFW1EF9GFC91150")?.make).toBe("Ford");
  });

  it("dedupe por URL (markdown trae text link + href) y no exige precio/millas", () => {
    const vs = parseDealerInventorySitemap(SITEMAP, "https://x/sitemap");
    expect(new Set(vs.map((v) => v.listingUrl)).size).toBe(4);
    expect(vs.every((v) => v.price === null && v.miles === null)).toBe(true);
  });

  it("parseInventoryFromAny elige el sitemap cuando hay muchas URLs /inventory/", () => {
    const vs = parseInventoryFromAny(SITEMAP, "https://x/sitemap");
    expect(vs).toHaveLength(4);
    expect(vs[0].vin).toBeTruthy();
  });

  it("vehicleFromSlug devuelve null sin VIN ni año", () => {
    expect(vehicleFromSlug("kia-telluride", "https://x/inventory/kia-telluride/", "https://x/sitemap")).toBeNull();
  });

  it("mergeVehicleStore preserva precio/millas/foto ya enriquecidos cuando el sitemap no los trae", () => {
    const prev = {
      updatedAt: 0,
      vehicles: {
        "vin:5XYP5DGC5SG712394": {
          key: "vin:5XYP5DGC5SG712394",
          vin: "5XYP5DGC5SG712394",
          title: "2025 Kia Telluride SX X Line AWD",
          year: 2025,
          make: "Kia",
          model: "Telluride SX X Line AWD",
          condition: "Nuevo",
          price: 49990,
          miles: 12,
          listingUrl:
            "https://www.greenwaykiawestpalmbeach.com/inventory/new-2025-kia-telluride-sx-x-line-awd-4d-sport-utility-5xyp5dgc5sg712394/",
          feedUrl: "https://x/sitemap",
          imageUrl: "https://cdn/a.jpg",
          imgStatus: "ok" as const,
          imgAt: 123,
          changedAt: 1,
        },
      },
    };
    const current = parseDealerInventorySitemap(SITEMAP, "https://x/sitemap");
    const merged = mergeVehicleStore(prev, current);
    const v = merged.vehicles["vin:5XYP5DGC5SG712394"];
    expect(v.price).toBe(49990);
    expect(v.miles).toBe(12);
    expect(v.imageUrl).toBe("https://cdn/a.jpg");
    expect(v.imgStatus).toBe("ok");
  });
});

describe("detalle de la ficha (JSON-LD): precio/millas/foto", () => {
  const HTML = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Car","name":"2021 Toyota RAV4 Hybrid XSE AWD",
 "vehicleIdentificationNumber":"JTMRWRFV0MD123456",
 "mileageFromOdometer":{"@type":"QuantitativeValue","value":45210},
 "offers":{"@type":"Offer","price":34990,"priceCurrency":"USD"},
 "image":["https://vehicle-images.carscommerce.inc/4ca7-110012956/JTMRWRFV0MD123456/abc.jpg"]}
</script></head><body><meta property="og:image" content="https://vehicle-images.carscommerce.inc/og.jpg"></body></html>`;

  it("extractDetailsFromHtml saca precio, millas e imagen del JSON-LD", () => {
    const d = extractDetailsFromHtml(HTML);
    expect(d.price).toBe(34990);
    expect(d.miles).toBe(45210);
    expect(d.image).toBe("https://vehicle-images.carscommerce.inc/4ca7-110012956/JTMRWRFV0MD123456/abc.jpg");
  });

  it("extractPriceFromText prefiere el precio etiquetado", () => {
    expect(extractPriceFromText("MSRP $38,000\nSale Price $34,990\n")).toBe(34990);
    expect(extractPriceFromText("$")).toBeNull();
  });

  it("extractMilesFromText parsea millas", () => {
    expect(extractMilesFromText("45,210 miles")).toBe(45210);
    expect(extractMilesFromText("sin datos")).toBeNull();
  });
});

describe("renderInventory*", () => {
  const vs = parseInventory(FEED, "https://x.com/llm/inventory/");

  it("renderInventoryParts: cada parte ≤ maxChars, sin links, sin cortar una ficha", () => {
    const parts = renderInventoryParts(vs, 400, 8);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(400));
    parts.forEach((p) => expect(p).not.toMatch(/https?:\/\//));
    // Un auto completo no debe quedar cortado: el último bloque es una ficha entera.
    for (const p of parts) {
      const lines = p.split("\n\n");
      lines.forEach((l) => expect(l.includes("· $") || l.startsWith("VIN")).toBe(true));
    }
  });

  it("renderInventorySummary lista las marcas reales y las reglas anti-alucinación", () => {
    const s = renderInventorySummary(vs, "/llm/inventory/", "https://www.greenwaykiawestpalmbeach.com/llm/inventory/");
    expect(s).toContain("Marcas disponibles: Kia (3), Chevrolet (1), Toyota (1)");
    expect(s).toContain("REGLAS");
    expect(s).toContain("fichaAuto");
    expect(s).toContain("Nunca uses conocimiento general");
  });

  it("renderVehicleBlock deja título · precio · VIN sin URL", () => {
    const v = vs.find((x) => x.vin === "5XYPG4A38LG625285")!;
    const line = renderVehicleBlock(v);
    expect(line).toContain("$17,593");
    expect(line).toContain("VIN 5XYPG4A38LG625285");
    expect(line).not.toMatch(/https?:\/\//);
  });
});

describe("imágenes de fichas", () => {
  it("extractImageFromMarkdown toma la primera foto real (filtra logos/svg/data)", () => {
    const md = `# Ficha
![logo](/logo.svg)
![](data:image/png;base64,xxxx)
![2022 Kia Telluride](https://images.greenway.com/vehicles/telluride.jpg?w=800)
[Ver ficha](https://x.com/a)`;
    expect(extractImageFromMarkdown(md)).toBe("https://images.greenway.com/vehicles/telluride.jpg?w=800");
    expect(extractImageFromMarkdown("![logo](/logo.svg)")).toBeNull();
  });

  it("extractImageFromHtml lee og:image y cae al primer <img>", () => {
    const html = `<html><head><meta property="og:image" content="https://cdn.x.com/car.jpg"></head><body><img src="https://cdn.x.com/thumb.jpg"></body></html>`;
    expect(extractImageFromHtml(html)).toBe("https://cdn.x.com/car.jpg");
    const noOg = `<html><body><img src="https://cdn.x.com/thumb.jpg"><img src="https://cdn.x.com/logo.png"></body></html>`;
    expect(extractImageFromHtml(noOg)).toBe("https://cdn.x.com/thumb.jpg");
  });
});

describe("store (settings D1)", () => {
  it("mergeVehicleStore: conserva foto y estado si no cambió; pide foto si cambió la ficha; borra vendidos", () => {
    const vs = parseInventory(FEED, "https://x.com");
    const empty = { updatedAt: 0, vehicles: {} };
    const first = mergeVehicleStore(empty, vs);
    const sorentoKey = vs.find((v) => v.vin === "5XYPG4A38LG625285")!.key;
    first.vehicles[sorentoKey].imgStatus = "ok";
    first.vehicles[sorentoKey].imageUrl = "https://img/x.jpg";

    // Feed sin cambios → conserva la foto.
    const same = mergeVehicleStore(first, vs);
    expect(same.vehicles[sorentoKey].imgStatus).toBe("ok");
    expect(same.vehicles[sorentoKey].imageUrl).toBe("https://img/x.jpg");

    // El Sorento se vendió → sale del store.
    const fewer = vs.filter((v) => v.vin !== "5XYPG4A38LG625285");
    const pruned = mergeVehicleStore(first, fewer);
    expect(pruned.vehicles[sorentoKey]).toBeUndefined();
    expect(Object.keys(pruned.vehicles)).toHaveLength(4);

    // Cambió la URL de la ficha → la foto se invalida y vuelve a pendiente.
    const changed = vs.map((v) =>
      v.vin === "5XYPG4A38LG625285"
        ? { ...v, listingUrl: "https://x.com/nuevo-link" }
        : v,
    );
    const again = mergeVehicleStore(first, changed);
    expect(again.vehicles[sorentoKey].imgStatus).toBe("pendiente");
    expect(again.vehicles[sorentoKey].imageUrl).toBeNull();
  });

  it("imageCandidates respeta el cooldown de errores", () => {
    const vs = parseInventory(FEED, "https://x.com");
    const store = mergeVehicleStore({ updatedAt: 0, vehicles: {} }, vs);
    const k = vs[0].key;
    store.vehicles[k].imgStatus = "error";
    store.vehicles[k].imgAt = Date.now(); // recién falló
    expect(imageCandidates(store).some((v) => v.key === k)).toBe(false);
    store.vehicles[k].imgAt = Date.now() - 4 * 86_400_000; // hace 4 días
    expect(imageCandidates(store).some((v) => v.key === k)).toBe(true);
  });
});

describe("consulta exacta (anti-alucinación)", () => {
  const store = mergeVehicleStore(
    { updatedAt: 0, vehicles: {} },
    parseInventory(FEED, "https://x.com"),
  );

  it("devuelve las marcas disponibles y totales reales", () => {
    const r = queryInventory(store, {});
    expect(r.marcas).toEqual([
      { marca: "Kia", total: 3 },
      { marca: "Chevrolet", total: 1 },
      { marca: "Toyota", total: 1 },
    ]);
    expect(r.total).toBe(5);
  });

  it("marca inexistente → total 0 (para que el bot diga que no la tiene)", () => {
    const r = queryInventory(store, { marca: "Toyota" });
    expect(r.total).toBe(1);
    const r2 = queryInventory(store, { marca: "Mazda" });
    expect(r2.matches).toHaveLength(0);
    expect(r2.total).toBe(0);
  });

  it("filtra por modelo, condición y rango de precio", () => {
    expect(queryInventory(store, { modelo: "Sorento" }).total).toBe(1);
    // "usado" incluye los certificados (un certified es un usado verificado):
    // Sorento (Pre-Owned) + Equinox (Used) + Forte (Used) + Camry (Certified).
    expect(queryInventory(store, { condicion: "usado" }).total).toBe(4);
    const usados = queryInventory(store, { condicion: "usado" }).matches.map((m) => m.title);
    expect(usados).toContain("2020 Kia Sorento LX");
    expect(usados).toContain("2021 Chevrolet Equinox LT");
    expect(usados).toContain("2022 Toyota Camry SE");
    expect(queryInventory(store, { condicion: "nuevo" }).total).toBe(1);
    expect(queryInventory(store, { precioMax: 20000 }).total).toBe(1);
    expect(queryInventory(store, { precioMin: 20000, precioMax: 25000 }).total).toBe(2);
  });
});

describe("ensureVehicleImage (bajo demanda, con Decodo)", () => {
  it("scrapea la ficha, guarda la foto y no vuelve a scrapear si ya está", async () => {
    const mf = await createTestMiniflare();
    const d1 = (await mf.getD1Database("DB")) as any;
    const db = new Db(d1);
    const feed = `-   [2020 Kia Sorento LX](https://www.greenwaykiawestpalmbeach.com/inventory/used/2020-kia-sorento-lx) Used $17,593 VIN: 5XYPG4A38LG625285`;
    const store = mergeVehicleStore({ updatedAt: 0, vehicles: {} }, parseInventory(feed, "https://x.com/llm/"));
    const key = Object.keys(store.vehicles)[0];
    await saveVehicleStore(db, store);

    const VDP = `<html><head><script type="application/ld+json">{"@type":"Car","offers":{"price":17593},"mileageFromOdometer":{"value":45210},"image":"https://cdn.greenway.com/sorento.jpg"}</script></head></html>`;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ content: VDP, status_code: 200 }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = { DB: d1, DECODO_AUTH: "user:pass" } as unknown as Env;
    const img = await ensureVehicleImage(env, db, key, { timeoutMs: 5000 });
    expect(img).toBe("https://cdn.greenway.com/sorento.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1); // HTML (JSON-LD) trajo foto + precio → no pide markdown

    const after = await loadVehicleStore(db);
    expect(after.vehicles[key].imgStatus).toBe("ok");
    expect(after.vehicles[key].price).toBe(17593);
    expect(after.vehicles[key].miles).toBe(45210);

    // Segundo llamado: cacheado, sin fetch nuevo.
    await ensureVehicleImage(env, db, key, { timeoutMs: 5000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si falla la ficha, marca error y no vuelve a intentar dentro de 1 h", async () => {
    const mf = await createTestMiniflare();
    const d1 = (await mf.getD1Database("DB")) as any;
    const db = new Db(d1);
    const feed = `-   [2020 Kia Sorento LX](https://www.greenwaykiawestpalmbeach.com/inventory/used/2020-kia-sorento-lx) Used $17,593 VIN: 5XYPG4A38LG625285`;
    const store = mergeVehicleStore({ updatedAt: 0, vehicles: {} }, parseInventory(feed, "https://x.com/llm/"));
    const key = Object.keys(store.vehicles)[0];
    await saveVehicleStore(db, store);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const env = { DB: d1, DECODO_AUTH: "user:pass" } as unknown as Env;
    expect(await ensureVehicleImage(env, db, key, { timeoutMs: 5000 })).toBeNull();

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ content: "![x](https://cdn/a.jpg)", status_code: 200 }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    // Dentro de la hora de cooldown no se repite el intento (no llama a Decodo).
    expect(await ensureVehicleImage(env, db, key, { timeoutMs: 5000 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
