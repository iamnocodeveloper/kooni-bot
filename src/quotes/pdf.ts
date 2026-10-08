import type { Env } from "../env";

/**
 * HTML → PDF con Cloudflare Browser Rendering (binding BROWSER).
 *
 * Opcional por diseño: sin el binding, devuelve null y el llamador degrada
 * (la cotización se envía como texto + enlace; el endpoint /q sirve el HTML).
 * Requiere habilitar Browser Rendering en la cuenta y en wrangler.toml:
 *   [browser]
 *   binding = "BROWSER"
 */
export async function htmlToPdf(env: Env, html: string): Promise<Uint8Array | null> {
  if (!env.BROWSER) return null;
  try {
    const puppeteer = await import("@cloudflare/puppeteer");
    const browser = await puppeteer.launch(env.BROWSER as any);
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
      });
      return pdf;
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.warn("[quotes] htmlToPdf falló (se degrada a enlace):", e);
    return null;
  }
}
