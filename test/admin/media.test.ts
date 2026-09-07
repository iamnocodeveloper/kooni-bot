import { describe, it, expect, vi, afterEach } from "vitest";
import { serveTelegramMedia, serveWahaMedia } from "../../src/admin/media";
import { maskTelegramToken } from "../../src/telegramFiles";
import type { Env } from "../../src/env";

afterEach(() => vi.restoreAllMocks());

describe("serveTelegramMedia (§V Fase 2 — proxy del panel)", () => {
  const env = { TELEGRAM_BOT_TOKEN: "12345:ABC" } as unknown as Env;

  it("400 sin el parámetro u", async () => {
    const res = await serveTelegramMedia("", env);
    expect(res.status).toBe(400);
  });

  it("404 sin token de Telegram configurado", async () => {
    const res = await serveTelegramMedia("bot__TOKEN__/photos/x.jpg", {} as Env);
    expect(res.status).toBe(404);
  });

  it("repone el token real y hace streaming del archivo (nunca llega al llamador)", async () => {
    const masked = maskTelegramToken("https://api.telegram.org/file/bot12345:ABC/photos/x.jpg");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response("bytes", { status: 200, headers: { "content-type": "image/jpeg" } });
      }),
    );
    const res = await serveTelegramMedia(masked, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(calls).toEqual(["https://api.telegram.org/file/bot12345:ABC/photos/x.jpg"]);
  });

  it("502 si Telegram no responde bien", async () => {
    const masked = maskTelegramToken("https://api.telegram.org/file/bot12345:ABC/photos/x.jpg");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    const res = await serveTelegramMedia(masked, env);
    expect(res.status).toBe(502);
  });
});

describe("serveWahaMedia (§V Fase 2 — proxy del panel, con guard anti-SSRF)", () => {
  const env = { WAHA_API_URL: "https://waha.example.com:3000", WAHA_API_KEY: "secretkey" } as unknown as Env;

  it("404 sin WAHA configurado", async () => {
    const res = await serveWahaMedia("https://waha.example.com:3000/api/files/x.jpg", {} as Env);
    expect(res.status).toBe(404);
  });

  it("400 si la URL pedida NO es del host configurado (bloquea SSRF)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await serveWahaMedia("https://attacker.example.com/x.jpg", env);
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hace streaming con la API key cuando la URL SÍ es del host configurado", async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, headers: init?.headers as Record<string, string> });
        return new Response("bytes", { status: 200, headers: { "content-type": "image/png" } });
      }),
    );
    const res = await serveWahaMedia("https://waha.example.com:3000/api/files/x.png", env);
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe("https://waha.example.com:3000/api/files/x.png");
    expect(calls[0].headers).toMatchObject({ "X-Api-Key": "secretkey" });
  });
});
