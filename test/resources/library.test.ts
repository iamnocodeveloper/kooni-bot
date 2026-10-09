import { describe, it, expect } from "vitest";
import {
  parseResourceLibrary,
  findResource,
  resourceMediaOf,
  resourceCatalogBlock,
  firstMessageResources,
} from "../../src/resources/library";

describe("resources/library", () => {
  it("parsea el modelo VIEJO (image/audio/document) normalizado", () => {
    const lib = parseResourceLibrary(
      JSON.stringify({
        catalogo: { image: "https://x/c.jpg", caption: "Nuestro catálogo" },
        bienvenida: { audio: "https://x/hola.ogg" },
        contrato: { document: "https://x/contrato.pdf" },
      }),
    );
    expect(lib.catalogo.kind).toBe("image");
    expect(lib.catalogo.url).toBe("https://x/c.jpg");
    expect(lib.catalogo.caption).toBe("Nuestro catálogo");
    expect(lib.bienvenida.kind).toBe("audio");
    expect(lib.bienvenida.asVoice).toBe(true);
    expect(lib.contrato.kind).toBe("document");
  });

  it("parsea el modelo NUEVO con when/keywords/asVoice", () => {
    const lib = parseResourceLibrary(
      JSON.stringify({
        ofertas: { kind: "image", url: "https://x/o.jpg", name: "ofertas.jpg", when: "cuando pidan ofertas", keywords: ["oferta", "promo"] },
        nota: { kind: "audio", url: "https://x/n.ogg", asVoice: false },
      }),
    );
    expect(lib.ofertas.when).toBe("cuando pidan ofertas");
    expect(lib.ofertas.keywords).toEqual(["oferta", "promo"]);
    expect(lib.ofertas.filename).toBe("ofertas.jpg");
    expect(lib.nota.asVoice).toBe(false);
  });

  it("ignora entradas sin url y JSON inválido", () => {
    expect(parseResourceLibrary("no-json")).toEqual({});
    expect(parseResourceLibrary(JSON.stringify({ vacio: { caption: "x" } }))).toEqual({});
    expect(parseResourceLibrary(JSON.stringify([]))).toEqual({});
    expect(parseResourceLibrary(null)).toEqual({});
  });

  it("findResource ignora mayúsculas", () => {
    const lib = parseResourceLibrary(JSON.stringify({ Ofertas: { kind: "image", url: "u" } }));
    expect(findResource(lib, "ofertas")?.url).toBe("u");
  });

  it("resourceMediaOf mapea kind → opciones de envío", () => {
    expect(resourceMediaOf({ name: "a", kind: "image", url: "u" })).toEqual({ imageUrl: "u" });
    expect(resourceMediaOf({ name: "a", kind: "audio", url: "u", asVoice: true })).toEqual({ audioUrl: "u", voice: true });
    expect(resourceMediaOf({ name: "a", kind: "audio", url: "u", asVoice: false })).toEqual({ audioUrl: "u" });
    expect(resourceMediaOf({ name: "a", kind: "video", url: "u" })).toEqual({ videoUrl: "u" });
    const doc = resourceMediaOf({ name: "a", kind: "document", url: "u", filename: "f.pdf" });
    expect(doc.documentUrl).toBe("u");
    expect(doc.documentName).toBe("f.pdf");
  });

  it("parsea video (kind video + legacy 'video')", () => {
    expect(parseResourceLibrary(JSON.stringify({ clip: { kind: "video", url: "https://x/v.mp4" } })).clip.kind).toBe("video");
    expect(parseResourceLibrary(JSON.stringify({ clip: { video: "https://x/v.mp4" } })).clip.kind).toBe("video");
  });

  it("resourceCatalogBlock lista nombres + cuándo (y vacío si no hay nada)", () => {
    expect(resourceCatalogBlock("")).toBe("");
    const block = resourceCatalogBlock(
      JSON.stringify({ ofertas: { kind: "image", url: "u", when: "cuando pidan ofertas" } }),
    );
    expect(block).toContain("ofertas");
    expect(block).toContain("cuando pidan ofertas");
    expect(block).toContain("<recursos_multimedia>");
  });

  it("parsea firstMessage y firstMessageResources lo filtra", () => {
    const raw = JSON.stringify({
      a: { kind: "image", url: "u", firstMessage: true },
      b: { kind: "image", url: "v" },
    });
    const lib = parseResourceLibrary(raw);
    expect(lib.a.firstMessage).toBe(true);
    expect(lib.b.firstMessage).toBeUndefined();
    expect(firstMessageResources(raw).map((r) => r.name)).toEqual(["a"]);
  });

  it("resourceCatalogBlock NO incluye los recursos firstMessage", () => {
    const raw = JSON.stringify({
      campana: { kind: "image", url: "u", firstMessage: true, when: "cuando escriba" },
      ofertas: { kind: "image", url: "v", when: "cuando pidan ofertas" },
    });
    const block = resourceCatalogBlock(raw);
    expect(block).toContain("ofertas");
    expect(block).not.toContain("campana");
  });
});
