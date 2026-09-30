import { describe, it, expect } from "vitest";
import {
  isPropertyUrl,
  parsePropertyFromAny,
  parsePropertyFromHtml,
  parsePropertyFromMarkdown,
  discoverPropertyUrls,
  priceFromPropertyText,
} from "../../src/kb/propertiesScrape";

const HTML = `<!doctype html><html><head>
<title>Casa Las Lomas | Inmobiliaria Ejemplo</title>
<meta property="og:title" content="Casa en Las Lomas con jardín" />
<meta property="og:image" content="/media/frente.jpg" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RealEstateListing","name":"Casa en Las Lomas",
 "offers":{"@type":"Offer","price":"4200000","priceCurrency":"MXN"},
 "numberOfRooms":4,"numberOfBathroomsTotal":3,"floorSize":{"value":"320"},
 "address":{"@type":"PostalAddress","addressLocality":"Las Lomas"},
 "image":"https://cdn.ejemplo.com/frente.jpg"}
</script></head><body><h1>Casa en Las Lomas</h1></body></html>`;

const MD = `# Casa en Las Lomas con jardín

Precio: $4,200,000 MXN
Operación: Venta
Colonia: Las Lomas

4 recámaras · 3 baños · 320 m2 de construcción · 2 estacionamientos

![Frente](https://cdn.ejemplo.com/frente.jpg)

Referencia: LN-1024
`;

describe("parsePropertyFromHtml (JSON-LD)", () => {
  it("saca título, precio, moneda, zona, recámaras, baños, m2 y foto", () => {
    const p = parsePropertyFromHtml(HTML, "https://x.com/propiedades/casa-las-lomas-1024/");
    expect(p).not.toBeNull();
    expect(p!.title).toBe("Casa en Las Lomas con jardín");
    expect(p!.precio).toBe(4_200_000);
    expect(p!.moneda).toBe("MXN");
    expect(p!.zona).toBe("Las Lomas");
    expect(p!.recamaras).toBe(4);
    expect(p!.banos).toBe(3);
    expect(p!.m2).toBe(320);
    expect(p!.tipo).toBe("casa");
    // og:image (imagen de portada) gana sobre la del JSON-LD.
    expect(p!.imageUrl).toBe("https://x.com/media/frente.jpg");
    expect(p!.source).toBe("web");
  });

  it("resuelve la imagen relativa (og:image sin dominio)", () => {
    const p = parsePropertyFromHtml(HTML, "https://x.com/propiedades/casa/");
    // og:image = "/media/frente.jpg" → absoluta contra la URL de la ficha.
    expect(p!.imageUrl).toBe("https://x.com/media/frente.jpg");
  });
});

describe("parsePropertyFromMarkdown (lo que devuelve AIsa)", () => {
  it("extrae precio, recámaras, baños, m2, zona, referencia y foto", () => {
    const p = parsePropertyFromMarkdown(MD, "https://x.com/renta/casa-las-lomas-1024/");
    expect(p).not.toBeNull();
    expect(p!.title).toBe("Casa en Las Lomas con jardín");
    expect(p!.precio).toBe(4_200_000);
    expect(p!.moneda).toBe("MXN");
    expect(p!.zona).toBe("Las Lomas");
    expect(p!.recamaras).toBe(4);
    expect(p!.banos).toBe(3);
    expect(p!.m2).toBe(320);
    expect(p!.estacionamiento).toBe(2);
    expect(p!.codigo).toBe("LN-1024");
    expect(p!.imageUrl).toBe("https://cdn.ejemplo.com/frente.jpg");
  });

  it("deduce la operación de la URL", () => {
    expect(parsePropertyFromMarkdown(MD, "https://x.com/renta/casa-1/")!.operacion).toBe("renta");
    expect(parsePropertyFromMarkdown(MD, "https://x.com/venta/casa-1/")!.operacion).toBe("venta");
  });

  it("sin markdown útil devuelve null", () => {
    expect(parsePropertyFromMarkdown("", "https://x.com/venta/casa-1/")).toBeNull();
  });

  it("precio de millones y renta mensual (el extractor de autos topaba en 500.000)", () => {
    expect(priceFromPropertyText("Precio: $4,200,000 MXN")).toBe(4_200_000);
    expect(priceFromPropertyText("Renta mensual: $12,500")).toBe(12_500);
    expect(priceFromPropertyText("$12,500,000")).toBe(12_500_000);
    expect(priceFromPropertyText("3,200,000 MXN")).toBe(3_200_000);
    expect(priceFromPropertyText("sin precios aquí")).toBeNull();
  });
});

describe("parsePropertyFromAny", () => {
  it("elige el parser según el contenido", () => {
    expect(parsePropertyFromAny(HTML, "https://x.com/venta/casa-1/")!.precio).toBe(4_200_000);
    expect(parsePropertyFromAny(MD, "https://x.com/venta/casa-1/")!.precio).toBe(4_200_000);
  });
});

describe("isPropertyUrl", () => {
  it("acepta fichas y descarta ruido", () => {
    expect(isPropertyUrl("https://x.com/propiedades/casa-las-lomas-1024")).toBe(true);
    expect(isPropertyUrl("https://x.com/renta/departamento-centro")).toBe(true);
    expect(isPropertyUrl("https://x.com/inmuebles/casa-1")).toBe(true);
    expect(isPropertyUrl("https://x.com/blog/como-comprar-casa")).toBe(false);
    expect(isPropertyUrl("https://x.com/contacto")).toBe(false);
    expect(isPropertyUrl("https://x.com/propiedades/agentes/juan")).toBe(false);
  });
});

describe("discoverPropertyUrls", () => {
  it("filtra las fichas de un sitemap directo", async () => {
    const xml = [
      "https://x.com/propiedades/casa-las-lomas-1024",
      "https://x.com/propiedades/departamento-centro-1058",
      "https://x.com/blog/mercado-2026",
      "https://x.com/contacto",
    ].join("\n");
    globalThis.fetch = (async () => new Response(xml, { status: 200 })) as never;
    const r = await discoverPropertyUrls({} as never, "https://x.com/sitemap.xml", 50);
    expect(r.urls).toContain("https://x.com/propiedades/casa-las-lomas-1024");
    expect(r.urls.some((u) => u.includes("/blog/"))).toBe(false);
    expect(r.urls.some((u) => u.endsWith("/contacto"))).toBe(false);
  });
});
