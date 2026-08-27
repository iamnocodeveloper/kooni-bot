import { describe, it, expect, vi, afterEach } from "vitest";
import { sendReplyCapped } from "../../src/replies/sender";
import type { Env } from "../../src/env";

afterEach(() => vi.restoreAllMocks());

// Captura todas las llamadas fetch (los adaptadores reales terminan en fetch).
function mockFetchCalls() {
  const calls: [string, RequestInit][] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
    calls.push([String(url), init]);
    return new Response("{}", { status: 200 });
  }));
  return calls;
}

describe("sendReplyCapped — degradación por canal (Fase A)", () => {
  it("Telegram recibe botones en el body (inline_keyboard)", async () => {
    const calls = mockFetchCalls();
    const { dropped } = await sendReplyCapped(
      "telegram",
      "123",
      ["hola"],
      { TELEGRAM_BOT_TOKEN: "tok" } as unknown as Env,
      { buttons: [{ text: "Ver", url: "https://x.com" }] },
    );
    expect(dropped).toEqual([]);
    const sendMsg = calls.find(([u]) => u.includes("/sendMessage"));
    expect(sendMsg).toBeTruthy();
    const body = JSON.parse(sendMsg![1].body as string);
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Ver", url: "https://x.com" });
  });

  it("Twilio NO soporta botones → los descarta (no van en el body), el texto se envía", async () => {
    const calls = mockFetchCalls();
    const { dropped } = await sendReplyCapped(
      "twilio",
      "whatsapp:+123",
      ["hola"],
      {
        TWILIO_ACCOUNT_SID: "sid",
        TWILIO_AUTH_TOKEN: "tok",
        TWILIO_WA_FROM: "whatsapp:+1",
      } as unknown as Env,
      { buttons: [{ text: "Ver", url: "https://x.com" }] },
    );
    expect(dropped).toContain("buttons");
    // El body de Twilio es form-urlencoded y NO debe contener "buttons"
    const twilioCall = calls.find(([u]) => u.includes("api.twilio.com"));
    expect(twilioCall).toBeTruthy();
    expect(String(twilioCall![1].body)).not.toContain("buttons");
    expect(String(twilioCall![1].body)).toContain("Body=hola");
  });

  it("Zernio envía botones con type url/postback", async () => {
    const calls = mockFetchCalls();
    const { dropped } = await sendReplyCapped(
      "zernio",
      "acct:conv",
      ["hola"],
      { ZERNIO_API_KEY: "key" } as unknown as Env,
      { buttons: [{ text: "Agendar", callback: "agendar" }] },
    );
    expect(dropped).toEqual([]);
    const zn = calls.find(([u]) => u.includes("/inbox/conversations/"));
    expect(zn).toBeTruthy();
    const body = JSON.parse(zn![1].body as string);
    expect(body.buttons[0]).toEqual({ type: "postback", title: "Agendar", payload: "agendar" });
  });
});
