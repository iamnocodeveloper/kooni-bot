import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { TaxiBasesRepo, TaxiDriversRepo, TaxiQueueRepo } from "../../src/db/taxi";
import { handleDriverMessage } from "../../src/taxi/driverInbound";
import { locationFromPayload } from "../../src/channels/waha";
import type { IncomingMessage } from "../../src/channels/shared";

const msg = (over: Partial<IncomingMessage>): IncomingMessage => ({
  channel: "waha",
  channelUserId: "584123456789@c.us",
  receivedAt: Date.now(),
  rawPayload: {},
  ...over,
});

// Estos dos no tocan D1: salen temprano por nicho/canal.
describe("handleDriverMessage — salidas tempranas", () => {
  it("no hace nada si el nicho no es taxis", async () => {
    const env = { BOT_NICHE: "restaurante" } as any;
    expect(await handleDriverMessage(env, msg({ text: "llegué" }))).toBe(false);
  });

  it("ignora canales que no son WhatsApp", async () => {
    const env = { BOT_NICHE: "taxis" } as any;
    expect(await handleDriverMessage(env, msg({ channel: "telegram", text: "llegué" }))).toBe(false);
  });
});

describe("locationFromPayload (WAHA)", () => {
  it("lee location / _data.locationMessageDegrees", () => {
    expect(locationFromPayload({ location: { latitude: 10, longitude: -66, name: "Casa" } })).toEqual({
      lat: 10,
      lng: -66,
      name: "Casa",
    });
    expect(locationFromPayload({ _data: { locationMessageDegrees: { latitude: -34.6, longitude: -58.4 } } })).toEqual({
      lat: -34.6,
      lng: -58.4,
    });
  });

  it("devuelve undefined si no hay coordenadas válidas", () => {
    expect(locationFromPayload({})).toBeUndefined();
    expect(locationFromPayload({ location: { latitude: 999, longitude: 0 } })).toBeUndefined();
  });
});

describe("handleDriverMessage — con DB (cola)", () => {
  let env: any;
  let db: Db;
  let baseId: string;
  let driverPhone: string;

  beforeEach(async () => {
    const mf = await createTestMiniflare();
    const d1 = await mf.getD1Database("DB");
    db = new Db(d1 as any);
    env = { DB: d1, BOT_NICHE: "taxis", DASHBOARD_BASE_URL: "https://bot.example" };
    baseId = await new TaxiBasesRepo(db).create({ name: "Centro" });
    driverPhone = "584123456789";
    await new TaxiDriversRepo(db).create({ code: "342", name: "Juan", phone: driverPhone, baseId });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  const run = (text: string) => handleDriverMessage(env, msg({ text, channelUserId: `${driverPhone}@c.us` }));

  it("un mensaje del conductor registrado lo encola y responde (no al agente)", async () => {
    expect(await run("llegué")).toBe(true);
    const waiting = await new TaxiQueueRepo(db).waitingForBase(baseId);
    expect(waiting.length).toBe(1);
  });

  it("'salir' lo saca de la cola", async () => {
    await run("llegué");
    expect(await run("me voy")).toBe(true);
    expect((await new TaxiQueueRepo(db).waitingForBase(baseId)).length).toBe(0);
  });

  it("un número no registrado NO lo maneja (sigue al agente)", async () => {
    expect(await handleDriverMessage(env, msg({ text: "hola", channelUserId: "589999999999@c.us" }))).toBe(false);
  });
});
