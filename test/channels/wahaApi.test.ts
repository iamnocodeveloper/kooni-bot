import { describe, it, expect, vi, afterEach } from "vitest";
import { getWahaSessionStatus, ensureWahaSession, fetchWahaQrPng } from "../../src/channels/wahaApi";
import type { WahaConfig } from "../../src/channels/wahaCredentials";

afterEach(() => vi.restoreAllMocks());

const cfg: WahaConfig = { base: "https://waha.example.com:3000", session: "default", apiKey: "key123" };

describe("getWahaSessionStatus", () => {
  it("null sin base o sin apiKey", async () => {
    expect(await getWahaSessionStatus({ base: "", session: "default" })).toBeNull();
    expect(await getWahaSessionStatus({ base: "https://x:3000", session: "default" })).toBeNull();
  });

  it("devuelve el status cuando WAHA responde 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "WORKING" }), { status: 200 })));
    expect(await getWahaSessionStatus(cfg)).toEqual({ status: "WORKING" });
  });

  it("null si WAHA responde error o no contesta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await getWahaSessionStatus(cfg)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await getWahaSessionStatus(cfg)).toBeNull();
  });
});

describe("ensureWahaSession", () => {
  it("falla claro si falta base o apiKey", async () => {
    expect(await ensureWahaSession({ base: "", session: "default" }, "https://w/webhooks/waha")).toMatchObject({ ok: false });
    expect(await ensureWahaSession({ base: "https://x:3000", session: "default" }, "https://w/webhooks/waha")).toMatchObject({ ok: false });
  });

  it("sesión existente: PUT config + POST start", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === undefined || init.method === "GET") return new Response(JSON.stringify({ status: "STOPPED" }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const res = await ensureWahaSession(cfg, "https://w.test/webhooks/waha?token=abc");
    expect(res.ok).toBe(true);
    const put = calls.find((c) => c.init?.method === "PUT");
    expect(put).toBeTruthy();
    const body = JSON.parse(put!.init!.body as string);
    expect(body.config.webhooks[0].url).toBe("https://w.test/webhooks/waha?token=abc");
    expect(calls.some((c) => c.init?.method === "POST" && c.url.endsWith("/start"))).toBe(true);
  });

  it("sesión inexistente (404): POST /api/sessions con start:true", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!init || init.method === undefined) return new Response("not found", { status: 404 });
      if (init.method === "POST" && url.endsWith("/api/sessions")) return new Response("{}", { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const res = await ensureWahaSession(cfg, "https://w.test/webhooks/waha");
    expect(res.ok).toBe(true);
  });

  it("propaga el error si WAHA rechaza la creación", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!init || init.method === undefined) return new Response("not found", { status: 404 });
      return new Response("bad request", { status: 400 });
    }));
    const res = await ensureWahaSession(cfg, "https://w.test/webhooks/waha");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});

describe("fetchWahaQrPng", () => {
  it("null sin base/apiKey", async () => {
    expect(await fetchWahaQrPng({ base: "", session: "default" })).toBeNull();
  });

  it("devuelve los bytes del PNG cuando WAHA responde 200", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200 })));
    const buf = await fetchWahaQrPng(cfg);
    expect(new Uint8Array(buf!)).toEqual(bytes);
  });
});
