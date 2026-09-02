/**
 * Los <script> del panel tienen que PARSEAR.
 *
 * El selector de proyectos armaba su HTML con comillas simples escapadas (\')
 * dentro de un template literal, así que la barra invertida se perdía y al
 * navegador le llegaba una cadena JS cortada por la mitad:
 *
 *   '<select onchange="if(this.value.indexOf('http')===0)…" '
 *
 * Resultado: "Uncaught SyntaxError: Unexpected identifier 'http'" en TODAS las
 * páginas del panel, y ese bloque entero no se ejecutaba nunca (el selector de
 * proyectos no aparecía aunque hubiera PEER_BOTS configurados).
 *
 * Un error de sintaxis solo se ve abriendo la consola del navegador, así que
 * esta prueba lo comprueba desde el servidor: coge cada script en línea del
 * HTML y lo pasa por el parser de JavaScript.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { layout } from "../../src/admin/views/layout";

const RE_SCRIPT_EN_LINEA = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

function scriptsDe(html: string): string[] {
  return [...html.matchAll(RE_SCRIPT_EN_LINEA)].map((m) => m[1]).filter((s) => s.trim());
}

describe("los scripts en línea del panel", () => {
  let html = "";
  beforeAll(async () => {
    html = await layout({ title: "Prueba", activeTab: "overview", body: "<p>hola</p>" });
  });

  it("hay scripts que revisar (si no, la prueba no probaría nada)", () => {
    expect(scriptsDe(html).length).toBeGreaterThan(0);
  });

  it("todos parsean como JavaScript válido", () => {
    for (const script of scriptsDe(html)) {
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it("el selector de proyectos escapa sus comillas como &#39;", () => {
    // Si vuelven los \' del código fuente, el navegador recibe 'http' suelto
    // dentro de una cadena ya delimitada por comillas simples.
    expect(html).toContain("indexOf(&#39;http&#39;)");
    expect(html).not.toContain("indexOf('http')");
  });

  it("trae el cajón de navegación móvil: hamburguesa, backdrop y toggle", () => {
    expect(html).toContain('class="hburger"');
    expect(html).toContain("data-nav-open");
    expect(html).toContain('class="nav-backdrop"');
    expect(html).toContain("data-nav-close");
    expect(html).toContain('classList.add("nav-open")');
  });

  it("rediseño 2026: tema claro/oscuro, fuente Sora, paleta morado/fucsia, sin restos de Forja", () => {
    expect(html).toContain("family=Sora");
    expect(html).toContain('id="kooni-theme"');
    expect(html).toContain("localStorage.getItem('kooni-theme')");
    expect(html).toContain('data-theme="light"'); // el bloque de tema claro existe
    expect(html).toContain("--accent:#e05fd8"); // fucsia (oscuro)
    expect(html).not.toContain("Space Grotesk");
    expect(html).not.toContain("#1a1206");
    expect(html).not.toMatch(/font-family:"Sora"/); // comillas dobles rotas en un style=""
    expect(html).not.toContain("{{");
  });
});
