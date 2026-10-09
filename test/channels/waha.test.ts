import { describe, it, expect, vi, afterEach } from "vitest";
import { wahaAdapter, verifyWahaWebhook, wahaConfig, pushNameFromPayload } from "../../src/channels/waha";
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

  it("acepta el shape REAL de WAHA (body + from, sin text/chatId)", async () => {
    const msg = await wahaAdapter.parseIncoming(
      makeReq({
        event: "message",
        session: "Cars",
        payload: {
          id: "false_15613519220@c.us_ABC",
          timestamp: 1789064400,
          from: "593983859723@c.us",
          fromMe: false,
          to: "15613519220@c.us",
          body: "hola, ¿qué autos tienen?",
          hasMedia: false,
          media: null,
        },
      }),
      envWaha,
    );
    expect(msg.channelUserId).toBe("593983859723@c.us");
    expect(msg.text).toBe("hola, ¿qué autos tienen?");
  });

  it("shape real con media: body + media.url", async () => {
    const msg = await wahaAdapter.parseIncoming(
      makeReq({
        event: "message",
        payload: {
          id: "x",
          from: "x@c.us",
          fromMe: false,
          body: "mirá esto",
          hasMedia: true,
          media: { mimetype: "image/jpeg", url: "https://cdn.example/img.jpg" },
        },
      }),
      envWaha,
    );
    expect(msg.text).toBe("mirá esto");
    expect(msg.imageUrl).toBe("https://cdn.example/img.jpg");
  });

  it("toma el pushName del payload como displayName (no el @lid)", async () => {
    const msg = await wahaAdapter.parseIncoming(
      makeReq({
        event: "message",
        payload: {
          id: "x",
          from: "73452614598810@lid",
          fromMe: false,
          body: "hola",
          _data: { notifyName: "Daniels Mezzadri" },
        },
      }),
      envWaha,
    );
    expect(msg.channelUserId).toBe("73452614598810@lid");
    expect(msg.displayName).toBe("Daniels Mezzadri");
    expect(pushNameFromPayload({ _data: { pushName: "Ana" } })).toBe("Ana");
    expect(pushNameFromPayload({})).toBeUndefined();
  });

  it("si el payload no trae nombre, lo pide a WAHA (/api/contacts → pushname)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ name: "D M", pushname: "Daniels Mezzadri" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const msg = await wahaAdapter.parseIncoming(
      makeReq({ event: "message", payload: { id: "x", from: "73452614598810@lid", fromMe: false, body: "hola" } }),
      envWaha,
    );
    expect(msg.displayName).toBe("Daniels Mezzadri");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/contacts?");
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
  function stub(status = 200) {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({}), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const urls = (m: any) => m.mock.calls.map((c: any[]) => String(c[0]));

  it("envía por POST /api/sendText con session + chatId (con presencia)", async () => {
    const fetchMock = stub();

    await wahaAdapter.sendReply(
      { channel: "waha", channelUserId: "593983859723@c.us", chunks: ["Hola", "¿te ayudo?"], interChunkDelayMs: 0 },
      envWaha,
    );

    const sendText = fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes("/api/sendText"));
    expect(sendText).toHaveLength(2);
    const [url, init] = sendText[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://waha.example.com:3000/api/sendText");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("apikey123");
    const body = JSON.parse(init.body as string);
    expect(body.session).toBe("ventas");
    expect(body.chatId).toBe("593983859723@c.us");
    expect(body.text).toBe("Hola");
    // Presencia natural: "escribiendo…" al empezar y cierre al terminar.
    expect(urls(fetchMock).some((u: string) => u.includes("/api/startTyping"))).toBe(true);
    expect(urls(fetchMock).some((u: string) => u.includes("/api/stopTyping"))).toBe(true);
  });

  it("lanza si WAHA_API_URL no está configurado", async () => {
    await expect(
      wahaAdapter.sendReply({ channel: "waha", channelUserId: "x@c.us", chunks: ["x"] }, {} as Env),
    ).rejects.toThrow("WAHA_API_URL");
  });

  it("envía imagen por /api/sendImage y el texto restante", async () => {
    const fetchMock = stub();

    await wahaAdapter.sendReply(
      { channel: "waha", channelUserId: "x@c.us", chunks: ["mira la foto", "y esto"], imageUrl: "https://cdn.example/img.jpg", interChunkDelayMs: 0 },
      envWaha,
    );

    const sendImage = fetchMock.mock.calls.find((c: any[]) => String(c[0]).includes("/api/sendImage"));
    expect(sendImage).toBeTruthy();
    const body = JSON.parse((sendImage![1] as RequestInit).body as string);
    expect(body.file.url).toBe("https://cdn.example/img.jpg");
    // solo el resto va como sendText (el primer chunk fue caption)
    const sendText = fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes("/api/sendText"));
    expect(sendText).toHaveLength(1);
  });

  it("envía video por /api/sendVideo con mimetype", async () => {
    const fetchMock = stub();

    await wahaAdapter.sendReply(
      { channel: "waha", channelUserId: "x@c.us", chunks: ["mirá"], videoUrl: "https://cdn.example/v.mp4", interChunkDelayMs: 0 },
      envWaha,
    );

    const sv = fetchMock.mock.calls.find((c: any[]) => String(c[0]).includes("/api/sendVideo"));
    expect(sv).toBeTruthy();
    const body = JSON.parse((sv![1] as RequestInit).body as string);
    expect(body.file.url).toBe("https://cdn.example/v.mp4");
    expect(body.file.mimetype).toBe("video/mp4");
  });

  it("envía audio como NOTA DE VOZ por /api/sendVoice (convert) con presencia recording", async () => {
    const fetchMock = stub();

    await wahaAdapter.sendReply(
      { channel: "waha", channelUserId: "x@c.us", chunks: ["escuchá"], audioUrl: "https://cdn.example/a.mp3", voice: true, interChunkDelayMs: 0 },
      envWaha,
    );

    const sendVoice = fetchMock.mock.calls.find((c: any[]) => String(c[0]).includes("/api/sendVoice"));
    expect(sendVoice).toBeTruthy();
    const body = JSON.parse((sendVoice![1] as RequestInit).body as string);
    expect(body.file.mimetype).toBe("audio/ogg; codecs=opus");
    expect(body.convert).toBe(true);
    // presencia "grabando audio"
    const presence = fetchMock.mock.calls.find((c: any[]) => String(c[0]).includes("/presence"));
    expect(presence).toBeTruthy();
    expect(JSON.parse((presence![1] as RequestInit).body as string).presence).toBe("recording");
  });

  it("marca visto con POST /api/sendSeen", async () => {
    const fetchMock = stub();
    await wahaAdapter.markSeen!("x@c.us", envWaha);
    const seen = fetchMock.mock.calls.find((c: any[]) => String(c[0]).includes("/api/sendSeen"));
    expect(seen).toBeTruthy();
    expect(JSON.parse((seen![1] as RequestInit).body as string).chatId).toBe("x@c.us");
  });
});
