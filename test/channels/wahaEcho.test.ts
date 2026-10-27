import { describe, it, expect } from "vitest";
import { wahaAdapter } from "../../src/channels/waha";

function req(body: unknown): Request {
  return new Request("https://x/webhooks/waha", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("WAHA — eco del dueño (fromMe)", () => {
  it("marca fromMe como ownerEcho y usa el destinatario como conversación", async () => {
    const msg = await wahaAdapter.parseIncoming(
      req({
        event: "message",
        payload: {
          fromMe: true,
          chatId: "59171234567@c.us",
          body: "Ya te confirmo por aquí",
          _data: { notifyName: "Daniel" },
        },
      }),
      {} as any,
    );
    expect(msg.ownerEcho).toBe(true);
    expect(msg.channel).toBe("waha");
    expect(msg.channelUserId).toBe("59171234567@c.us");
    expect(msg.text).toBe("Ya te confirmo por aquí");
  });

  it("un mensaje entrante normal NO es ownerEcho", async () => {
    const msg = await wahaAdapter.parseIncoming(
      req({
        event: "message",
        payload: { fromMe: false, chatId: "59171234567@c.us", body: "Hola", _data: { notifyName: "Cliente" } },
      }),
      {} as any,
    );
    expect(msg.ownerEcho).toBeUndefined();
    expect(msg.channelUserId).toBe("59171234567@c.us");
  });

  it("ignora acks y mensajes de grupo/estado", async () => {
    await expect(
      wahaAdapter.parseIncoming(req({ event: "message.ack", payload: {} }), {} as any),
    ).rejects.toThrow();
    await expect(
      wahaAdapter.parseIncoming(
        req({ event: "message", payload: { chatId: "1203630@g.us", body: "hola" } }),
        {} as any,
      ),
    ).rejects.toThrow();
    await expect(
      wahaAdapter.parseIncoming(
        req({ event: "message", payload: { chatId: "status@broadcast", body: "hola" } }),
        {} as any,
      ),
    ).rejects.toThrow();
  });
});
