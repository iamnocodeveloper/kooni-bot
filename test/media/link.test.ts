import { describe, it, expect } from "vitest";
import { signMediaToken, verifyMediaToken, mediaUrl } from "../../src/media/link";

const env = { DASHBOARD_PASSWORD: "test-pass", DASHBOARD_BASE_URL: "https://bot.test" } as any;

describe("enlaces firmados de media", () => {
  it("firma y verifica (round-trip)", async () => {
    const token = await signMediaToken(env, "abc-123");
    expect(token.startsWith("abc-123.")).toBe(true);
    expect(await verifyMediaToken(env, token)).toBe("abc-123");
  });

  it("rechaza una firma manipulada o un secreto distinto", async () => {
    const token = await signMediaToken(env, "abc-123");
    expect(await verifyMediaToken(env, token.replace(/.$/, "0"))).toBeNull();
    expect(await verifyMediaToken({ ...env, DASHBOARD_PASSWORD: "otro" }, token)).toBeNull();
    expect(await verifyMediaToken(env, "sin-punto")).toBeNull();
  });

  it("arma la URL pública", async () => {
    expect(await mediaUrl(env, "abc")).toMatch(/^https:\/\/bot\.test\/media\/abc\./);
  });
});
