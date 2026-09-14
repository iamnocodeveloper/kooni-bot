import { describe, it, expect } from "vitest";
import { detectLanguage, baseLangCode, LANG_LABEL } from "../../src/lang/detect";

describe("detectLanguage", () => {
  it("detecta inglés en mensajes de cliente reales", () => {
    expect(detectLanguage("How much for the Kia Sorento?")).toBe("en");
    expect(detectLanguage("Hi, I am interested in a test drive for the Telluride")).toBe("en");
    expect(detectLanguage("Do you have any used cars available this weekend?")).toBe("en");
    expect(detectLanguage("what is the price of the white one")).toBe("en");
  });

  it("detecta portugués (incluso sin tildes)", () => {
    expect(detectLanguage("Olá, quanto custa o carro?")).toBe("pt");
    expect(detectLanguage("Ola, quanto custa o carro disponivel?")).toBe("pt");
    expect(detectLanguage("Gostaria de saber se tem disponível o Sorento")).toBe("pt");
    expect(detectLanguage("boa tarde, preciso de informacoes sobre financiamento")).toBe("pt");
    expect(detectLanguage("obrigado, vou visitar a loja")).toBe("pt");
  });

  it("detecta español", () => {
    expect(detectLanguage("Hola, ¿cuánto cuesta el carro?")).toBe("es");
    expect(detectLanguage("Buenos días, me interesa el Kia Telluride")).toBe("es");
    expect(detectLanguage("quisiera saber el precio del auto usado")).toBe("es");
  });

  it("devuelve null cuando no hay evidencia suficiente", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("   ")).toBeNull();
    expect(detectLanguage(null)).toBeNull();
    expect(detectLanguage(undefined)).toBeNull();
    expect(detectLanguage("ok")).toBeNull();
    expect(detectLanguage("5XYPKDA58PG242135")).toBeNull();
    expect(detectLanguage("2023")).toBeNull();
  });

  it("devuelve null en empate en vez de adivinar", () => {
    // "carro" cuenta para español y portugués; sin más señal debe abstenerse.
    expect(detectLanguage("carro")).toBeNull();
  });

  it("no confunde español con portugués en frases típicas", () => {
    expect(detectLanguage("¿Tienen carros disponibles?")).toBe("es");
    expect(detectLanguage("Vocês têm carros disponíveis?")).toBe("pt");
  });
});

describe("baseLangCode", () => {
  it("reduce el idioma base a código de 2 letras", () => {
    expect(baseLangCode("es-MX")).toBe("es");
    expect(baseLangCode("pt-BR")).toBe("pt");
    expect(baseLangCode("en")).toBe("en");
    expect(baseLangCode("EN-US")).toBe("en");
  });

  it("cae a español si no hay valor o es desconocido", () => {
    expect(baseLangCode("")).toBe("es");
    expect(baseLangCode(null)).toBe("es");
    expect(baseLangCode(undefined)).toBe("es");
    expect(baseLangCode("fr-FR")).toBe("es");
  });
});

describe("LANG_LABEL", () => {
  it("tiene etiqueta para cada idioma soportado", () => {
    expect(LANG_LABEL.es).toBe("español");
    expect(LANG_LABEL.en).toBe("inglés");
    expect(LANG_LABEL.pt).toBe("portugués");
  });
});
