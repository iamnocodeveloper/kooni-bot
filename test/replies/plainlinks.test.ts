import { describe, it, expect, vi, afterEach } from "vitest";
import { pickAdapter } from "../../src/replies/sender";
import { wahaAdapter } from "../../src/channels/waha";
import { zernioAdapter } from "../../src/channels/zernio";
import { metaAdapter } from "../../src/channels/meta";

afterEach(() => vi.restoreAllMocks());

describe("pickAdapter normaliza los links salientes (clickeables en el canal)", () => {
  it("WhatsApp (WAHA): [texto](url) → texto (url)", async () => {
    const spy = vi.spyOn(wahaAdapter, "sendReply").mockResolvedValue(undefined as never);
    await pickAdapter("waha").sendReply(
      { channel: "waha", channelUserId: "x", chunks: ["Ficha: [2021 RAV4](https://x.com/inventory/a/)"] } as never,
      {} as never,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].chunks).toEqual(["Ficha: 2021 RAV4 (https://x.com/inventory/a/)"]);
  });

  it("Instagram/Facebook (Zernio y Meta): también quedan con URL plana", async () => {
    const z = vi.spyOn(zernioAdapter, "sendReply").mockResolvedValue(undefined as never);
    await pickAdapter("zernio").sendReply(
      { channel: "zernio", channelUserId: "x", chunks: ["<https://x.com/a/>"] } as never,
      {} as never,
    );
    expect(z.mock.calls[0][0].chunks).toEqual(["https://x.com/a/"]);

    const m = vi.spyOn(metaAdapter, "sendReply").mockResolvedValue(undefined as never);
    await pickAdapter("instagram").sendReply(
      { channel: "instagram", channelUserId: "x", chunks: ["[ver](https://x.com/b/)"] } as never,
      {} as never,
    );
    expect(m.mock.calls[0][0].chunks).toEqual(["ver (https://x.com/b/)"]);
  });

  it("no toca el texto sin links", async () => {
    const spy = vi.spyOn(wahaAdapter, "sendReply").mockResolvedValue(undefined as never);
    await pickAdapter("waha").sendReply(
      { channel: "waha", channelUserId: "x", chunks: ["Hola, ¿en qué te ayudo?"] } as never,
      {} as never,
    );
    expect(spy.mock.calls[0][0].chunks).toEqual(["Hola, ¿en qué te ayudo?"]);
  });
});
