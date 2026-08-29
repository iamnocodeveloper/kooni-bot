import { describe, it, expect, vi, afterEach } from "vitest";
import { wahaAdapter, verifyWahaWebhook, wahaConfig } from "../../src/channels/waha";
import type { Env } from "../../src/env";

afterEach(() => vi.restoreAllMocks());

const envWaha = {
  WAHA_API_URL: "https://waha.example.com:3000",
  WAHA_API_KEY: "apikey123",
  WAHA_SESSION: "ventas",
} as unknown as Env;

function makeReq(body: unknown, url = "https://worker.test/webhooks/waha"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("wahaConfig / verifyWahaWebhook", () => {
  it("sin WAHA_API_URL el canal está apagado (fail-closed)", async () => {
    expect(await verifyWahaWebhook(makeReq({}), {} as Env)).toBe(false);
  });

  it("valida el token cuando WAHA_WEBHOOK_TOKEN está configurado", async () => {
    const env = { ...envWaha, WAHA_WEBHOOK_TOKEN: "secret1" } as unknown as Env;
    expect(await verifyWahaWebhook(makeReq({}, "https://x.test/webhooks/waha?token=secret1"), env)).toBe(true);
    expect(await verifyWahaWebhook(makeReq({}, "https://x.test/webhooks/waha?token=malo"), env)).toBe(false);
    expect(await verifyWahaWebhook(makeReq({}), env)).toBe(false);
  });

  it("sin token configurado acepta (canal con API key pero sin secret de webhook)", async () => {
    expect(await verifyWahaWebhook(makeReq({}), envWaha)).toBe(true);
  });

  it("normaliza la base URL y la sesión", () => {
    const cfg = wahaConfig(envWaha);
    expect(cfg.base).toBe("https://waha.example.com:3000");
    expect(cfg.session).toBe("ventas");
    expect(wahaConfig({ WAHA_API_URL: "https://x:3000/" } as unknown as Env).session).toBe("default");
  });
});

describe("wahaAdapter.parseIncoming", () => {
  it("convierte un mensaje entrante (payload v3)", async () => {
    const msg = await wahaAdapter.parseIncoming(
      makeReq({
        event: "message",
        session: "ventas",
        payload: { id: "false_1", chatId: "593983859723@c.us", fromMe: false, text: "hola, ¿precios?" },
      }),
      envWaha,
    );
    expect(msg.channel).toBe("waha");
    expect(msg.channelUserId).toBe("593983859723@c.us");
    expect(msg.text).toBe("hola, ¿precios?");
  });

  it("ignora ecos propios (fromMe) y acks", async () => {
    await expect(
      wahaAdapter.parseIncoming(makeReq({ event: "message", payload: { chatId: "x@c.us", fromMe: true, text: "ok" } }), envWaha),
    ).rejects.toThrow();
    await expect(wahaAdapter.parseIncoming(makeReq({ event: "ack", payload: {} }), envWaha)).rejects.toThrow();
  });

  it("extrae imagen del media", async () => {
    const msg = await wahaAdapter.parseIncoming(
      makeReq({
        event: "message",
        payload: { chatId: "x@c.us", fromMe: false, media: { mimetype: "image/jpeg", url: "https://cdn.example/img.jpg" } },
      }),
      envWaha,
    );
    expect(msg.imageUrl).toBe("https://cdn.example/img.jpg");
  });
});

describe("wahaAdapter.sendReply", () => {
  it("envía por POST /api/sendText con session + chatId", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ chatId: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await wahaAdapter.sendReply(
      { channel: "waha", channelUserId: "593983859723@c.us", chunks: ["Hola", "¿te ayudo?"], interChunkDelayMs: 0 },
      envWaha,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://waha.example.com:3000/api/sendText");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("apikey123");
    const body = JSON.parse(init.body as string);
    expect(body.session).toBe("ventas");
    expect(body.chatId).toBe("593983859723@c.us");
    expect(body.text).toBe("Hola");
  });

  it("lanza si WAHA_API_URL no está configurado", async () => {
    await expect(
      wahaAdapter.sendReply({ channel: "waha", channelUserId: "x@c.us", chunks: ["x"] }, {} as Env),
    ).rejects.toThrow("WAHA_API_URL");
  });

  it("envía imagen por /api/sendFile y el texto restante", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await wahaAdapter.sendReply(
      { channel: "waha", channelUserId: "x@c.us", chunks: ["mira la foto", "y esto"], imageUrl: "https://cdn.example/img.jpg", interChunkDelayMs: 0 },
      envWaha,
    );

    const sendFile = fetchMock.mock.calls.find((c) => String((c as [string])[0]).includes("/api/sendFile"));
    expect(sendFile).toBeTruthy();
    const body = JSON.parse((sendFile![1] as RequestInit).body as string);
    expect(body.file.url).toBe("https://cdn.example/img.jpg");
    // solo el resto va como sendText (el primer chunk fue caption)
    const sendText = fetchMock.mock.calls.filter((c) => String((c as [string])[0]).includes("/api/sendText"));
    expect(sendText).toHaveLength(1);
  });
});
