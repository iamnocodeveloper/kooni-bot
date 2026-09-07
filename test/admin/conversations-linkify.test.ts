import { describe, it, expect } from "vitest";
import { linkify } from "../../src/admin/views/conversations";

describe("linkify (hilo de conversaciones — §V Fase 1)", () => {
  it("texto normal sin URLs no se toca", () => {
    expect(linkify("Hola, ¿tienen el Kia Sportage 2022?")).toBe("Hola, ¿tienen el Kia Sportage 2022?");
  });

  it("envuelve una URL en <a> clicable", () => {
    const out = linkify("Mira este: https://ejemplo.com/inventario");
    expect(out).toBe(
      'Mira este: <a href="https://ejemplo.com/inventario" target="_blank" rel="noopener noreferrer">https://ejemplo.com/inventario</a>',
    );
  });

  it("agrega download cuando la URL termina en una extensión conocida", () => {
    const out = linkify("Factura: https://ejemplo.com/factura.pdf");
    expect(out).toContain('<a href="https://ejemplo.com/factura.pdf" target="_blank" rel="noopener noreferrer" download>');
  });

  it("no agrega download a una URL sin extensión de archivo", () => {
    const out = linkify("https://ejemplo.com/inventario");
    expect(out).not.toContain("download");
  });

  it("deja la puntuación de cierre de frase FUERA del link", () => {
    const out = linkify("Visítanos en https://ejemplo.com.");
    expect(out).toBe('Visítanos en <a href="https://ejemplo.com" target="_blank" rel="noopener noreferrer">https://ejemplo.com</a>.');
  });

  it("varias URLs en el mismo mensaje, todas envueltas", () => {
    const out = linkify("Ver https://a.test/1 o https://b.test/2");
    expect(out.match(/<a /g)?.length).toBe(2);
  });

  it("es seguro sobre texto ya escapado con entidades HTML", () => {
    // simula escapeHtml("<script>") + una URL — nada se decodifica, solo se envuelve.
    const escaped = "&lt;script&gt; visita https://ejemplo.com/x";
    const out = linkify(escaped);
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain('<a href="https://ejemplo.com/x"');
  });
});
