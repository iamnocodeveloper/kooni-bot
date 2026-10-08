import { describe, it, expect } from "vitest";
import { signQuoteToken, verifyQuoteToken, quotePdfUrl, quoteFilename } from "../../src/quotes/link";

const env = { DASHBOARD_PASSWORD: "test-pass", DASHBOARD_BASE_URL: "https://bot.test" } as any;

describe("enlaces firmados de cotización", () => {
  it("firma y verifica (round-trip)", async () => {
    const token = await signQuoteToken(env, "quote-123");
    expect(token.startsWith("quote-123.")).toBe(true);
    expect(await verifyQuoteToken(env, token)).toBe("quote-123");
  });

  it("rechaza una firma manipulada o un secreto distinto", async () => {
    const token = await signQuoteToken(env, "quote-123");
    expect(await verifyQuoteToken(env, token.replace(/.$/, "0"))).toBeNull();
    expect(await verifyQuoteToken({ ...env, DASHBOARD_PASSWORD: "otro" }, token)).toBeNull();
    expect(await verifyQuoteToken(env, "sin-punto")).toBeNull();
  });

  it("arma la URL pública y el nombre de archivo", async () => {
    expect(await quotePdfUrl(env, "abc")).toMatch(/^https:\/\/bot\.test\/q\/abc\./);
    expect(quoteFilename({ number: "COT-202610-0001", id: "x" })).toBe("Cotizacion-COT-202610-0001.pdf");
  });
});
