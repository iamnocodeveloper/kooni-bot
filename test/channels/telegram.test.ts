import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { telegramAdapter, resolveTelegramFileUrl } from "../../src/channels/telegram";
import type { Env } from "../../src/env";

function makeReq(body: unknown): Request {
  return new Request("https://bot.test/webhooks/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const env = { TELEGRAM_BOT_TOKEN: "test-token" } as Env;

// Telegram media (voice/photo) is NOT directly addressable by file_id — the
// adapter must call getFile to obtain a file_path, then build the download URL.
// So media tests mock fetch to stand in for that getFile call.
function mockGetFile(filePath: string) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true, result: { file_path: filePath } }), {
      status: 200,
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("telegramAdapter.parseIncoming", () => {
  it("parses a text message (no fetch needed)", async () => {
    const msg = await telegramAdapter.parseIncoming(
      makeReq({
        update_id: 1,
        message: {
          message_id: 10,
          from: { id: 555, first_name: "Ana", is_bot: false },
          chat: { id: 555, type: "private" },
          date: 100,
          text: "hola",
        },
      }),
      env,
    );
    expect(msg.channel).toBe("telegram");
    expect(msg.channelUserId).toBe("555");
    expect(msg.text).toBe("hola");
    expect(msg.displayName).toBe("Ana");
  });

  it("grupo: usa el id del grupo como destino y marca replyToMessageId", async () => {
    const msg = await telegramAdapter.parseIncoming(
      makeReq({
        update_id: 2,
        message: {
          message_id: 42,
          from: { id: 555, first_name: "Ana", is_bot: false },
          chat: { id: -100123456789, type: "supergroup" },
          date: 100,
          text: "¿precios?",
        },
      }),
      env,
    );
    expect(msg.channelUserId).toBe("g-100123456789");
    expect(msg.replyToMessageId).toBe(42);
    expect(msg.isOwnerMessage).toBe(false);
  });

  it("ignora mensajes de otros bots (evita loops bot↔bot)", async () => {
    await expect(
      telegramAdapter.parseIncoming(
        makeReq({
          update_id: 3,
          message: {
            message_id: 1,
            from: { id: 999, first_name: "OtroBot", is_bot: true },
            chat: { id: -100123456789, type: "supergroup" },
            date: 100,
            text: "hola",
          },
        }),
        env,
      ),
    ).rejects.toThrow("another bot");
  });

  it("resolves voice notes to a real download URL via getFile", async () => {
    mockGetFile("voice/file_5.oga");
    const msg = await telegramAdapter.parseIncoming(
      makeReq({
        update_id: 2,
        message: {
          message_id: 11,
          from: { id: 555, first_name: "Ana", is_bot: false },
          chat: { id: 555, type: "private" },
          date: 100,
          voice: { file_id: "voice-abc", duration: 5 },
        },
      }),
      env,
    );
    // The resolved URL is the downloadable HTTPS path, not the raw file_id.
    expect(msg.audioUrl).toBe(
      "https://api.telegram.org/file/bottest-token/voice/file_5.oga",
    );
  });

  it("resolves photos to a real download URL + uses caption as text", async () => {
    mockGetFile("photos/file_9.jpg");
    const msg = await telegramAdapter.parseIncoming(
      makeReq({
        update_id: 3,
        message: {
          message_id: 12,
          from: { id: 555, first_name: "Ana", is_bot: false },
          chat: { id: 555, type: "private" },
          date: 100,
          photo: [
            { file_id: "photo-small", width: 90, height: 90 },
            { file_id: "photo-large", width: 800, height: 800 },
          ],
          caption: "mira esto",
        },
      }),
      env,
    );
    expect(msg.imageUrl).toBe(
      "https://api.telegram.org/file/bottest-token/photos/file_9.jpg",
    );
    expect(msg.text).toBe("mira esto");
  });

  it("flags the owner's own message via OWNER_TELEGRAM_CHAT_ID", async () => {
    const ownerEnv = { TELEGRAM_BOT_TOKEN: "t", OWNER_TELEGRAM_CHAT_ID: "999" } as Env;
    const msg = await telegramAdapter.parseIncoming(
      makeReq({
        update_id: 4,
        message: {
          message_id: 13,
          from: { id: 999, first_name: "Dueño", is_bot: false },
          chat: { id: 999, type: "private" },
          date: 100,
          text: "yo me encargo",
        },
      }),
      ownerEnv,
    );
    expect(msg.isOwnerMessage).toBe(true);
  });
});

describe("resolveTelegramFileUrl", () => {
  it("returns null when getFile fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 400 }));
    const url = await resolveTelegramFileUrl("x", "tok");
    expect(url).toBeNull();
  });
});

describe("telegramAdapter.sendReply — botones y multimedia (Fase A)", () => {
  it("envía botones como inline_keyboard en el último chunk", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await telegramAdapter.sendReply(
      {
        channel: "telegram",
        channelUserId: "123",
        chunks: ["Hola, ¿qué necesitas?"],
        buttons: [{ text: "Precios", callback: "precios" }, { text: "Web", url: "https://kooni.click" }],
      },
      { TELEGRAM_BOT_TOKEN: "tok" } as any,
    );

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const sendMsg = calls.find((c) => String(c[0]).includes("/sendMessage"));
    expect(sendMsg).toBeTruthy();
    const body = JSON.parse(sendMsg![1].body as string);
    expect(body.reply_markup.inline_keyboard[0]).toEqual([
      { text: "Precios", callback_data: "precios" },
      { text: "Web", url: "https://kooni.click" },
    ]);
  });

  it("grupo: envía al chat del grupo y responde en el hilo (reply_to_message_id)", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await telegramAdapter.sendReply(
      {
        channel: "telegram",
        channelUserId: "g-100123456789",
        chunks: ["Claro, los precios están en el menú"],
        replyToMessageId: 42,
      },
      { TELEGRAM_BOT_TOKEN: "tok" } as any,
    );

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const sendMsg = calls.find((c) => String(c[0]).includes("/sendMessage"));
    expect(sendMsg).toBeTruthy();
    const body = JSON.parse(sendMsg![1].body as string);
    expect(body.chat_id).toBe("-100123456789"); // el grupo, no el usuario
    expect(body.reply_to_message_id).toBe(42);
  });

  it("envía imagen con sendPhoto y el primer chunk como caption", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await telegramAdapter.sendReply(
      { channel: "telegram", channelUserId: "123", chunks: ["Aquí tienes el catálogo"], imageUrl: "https://img/x.jpg" },
      { TELEGRAM_BOT_TOKEN: "tok" } as any,
    );

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const photo = calls.find((c) => String(c[0]).includes("/sendPhoto"));
    expect(photo).toBeTruthy();
    const body = JSON.parse(photo![1].body as string);
    expect(body.photo).toBe("https://img/x.jpg");
    expect(body.caption).toBe("Aquí tienes el catálogo");
  });

  it("envía audio con sendVoice", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await telegramAdapter.sendReply(
      { channel: "telegram", channelUserId: "123", chunks: ["Te dejo un audio"], audioUrl: "https://aud/x.ogg" },
      { TELEGRAM_BOT_TOKEN: "tok" } as any,
    );

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const voice = calls.find((c) => String(c[0]).includes("/sendVoice"));
    expect(voice).toBeTruthy();
    const body = JSON.parse(voice![1].body as string);
    expect(body.voice).toBe("https://aud/x.ogg");
  });
});
