import { describe, it, expect } from "vitest";
import { matchKeywords, stripSpecialCharacters, renderUsername } from "../../src/utils/keyword-matcher";

describe("matchKeywords", () => {
  it("matchea palabra completa case-insensitive", () => {
    expect(matchKeywords("Quiero el PRECIO", ["precio"], true).matched).toBe(true);
    expect(matchKeywords("Quiero precios", ["precio"], true).matched).toBe(false); // plural no matchea
  });

  it("con wholeWordMatch=false matchea parcial (link en linking)", () => {
    expect(matchKeywords("linking", ["link"], false).matched).toBe(true);
    expect(matchKeywords("linking", ["link"], true).matched).toBe(false);
  });

  it("cualquiera de las keywords matchea (OR)", () => {
    const r = matchKeywords("me interesa el catálogo", ["precio", "catálogo"], true);
    expect(r.matched).toBe(true);
    expect(r.matchedKeyword).toBe("catálogo");
  });

  it("ignora emojis y puntuación", () => {
    expect(matchKeywords("Precio!!! 🔥🔥", ["precio"], true).matched).toBe(true);
  });

  it("soporta acentos y scripts no-latin", () => {
    expect(matchKeywords("catálogo", ["catalogo"], true).matched).toBe(false); // acento importa
    expect(matchKeywords("catálogo", ["catálogo"], true).matched).toBe(true);
    expect(matchKeywords("Привет", ["привет"], true).matched).toBe(true); // cirílico
  });

  it("no matchea con texto vacío o sin keywords", () => {
    expect(matchKeywords("", ["x"], true).matched).toBe(false);
    expect(matchKeywords("hola", [], true).matched).toBe(false);
  });

  it("escapa caracteres especiales de la keyword", () => {
    expect(matchKeywords("c++ es genial", ["c++"], true).matched).toBe(true);
  });
});

describe("stripSpecialCharacters", () => {
  it("deja solo letras, números y espacios", () => {
    expect(stripSpecialCharacters("Hola! 👋 ¿Cómo estás?")).toBe("Hola Cómo estás");
  });
});

describe("renderUsername", () => {
  it("reemplaza {username} con el nombre dado", () => {
    expect(renderUsername("Hola {username}, te mando el link", "maria.g")).toBe("Hola maria.g, te mando el link");
  });
  it("usa 'there' si no hay nombre", () => {
    expect(renderUsername("Hola {username}", undefined)).toBe("Hola there");
    expect(renderUsername("Hola {username}", "  ")).toBe("Hola there");
  });
  it("no toca mensajes sin {username}", () => {
    expect(renderUsername("Hola, te mando el link", "maria")).toBe("Hola, te mando el link");
  });
});
