import { describe, it, expect, vi, afterEach } from "vitest";
import type { Env } from "../../src/env";

// El adapter resuelve el token del vendedor vía getMlAccessToken; lo mockeamos
// para no tocar D1 ni la red del refresh.
vi.mock("../../src/channels/mercadolibreCredentials", async (orig) => {
  const actual = await orig<typeof import("../../src/channels/mercadolibreCredentials")>();
  return {
    ...actual,
    getMlAccessToken: vi.fn(async () => ({ token: "AT", userId: "SELLER1", site: "MLA" })),
  };
});

import { parseMercadoLibreEvents, mercadolibreAdapter } from "../../src/channels/mercadolibre";
import { getMlAccessToken } from "../../src/channels/mercadolibreCredentials";

const env = {} as Env;

afterEach(() => vi.restoreAllMocks());

function mockFetchJson(map: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    for (const [frag, body] of Object.entries(map)) {
      if (url.includes(frag)) return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("parseMercadoLibreEvents", () => {
  it("convierte una pregunta SIN responder en mensaje para el agente", async () => {
    mockFetchJson({
      "/questions/999": {
        id: 999,
        text: "¿Tienen envío a Córdoba?",
        status: "UNANSWERED",
        item_id: "MLA123",
        from: { id: 42 },
      },
    });
    const out = await parseMercadoLibreEvents(
      { topic: "questions", resource: "/questions/999", user_id: "SELLER1" },
      env,
    );
    expect(out).toHaveLength(1);
    expect(out[0].channel).toBe("mercadolibre");
    expect(out[0].channelUserId).toBe("q:999:42");
    expect(out[0].text).toBe("¿Tienen envío a Córdoba?");
  });

  it("ignora preguntas ya respondidas", async () => {
    mockFetchJson({ "/questions/1": { id: 1, text: "x", status: "ANSWERED", from: { id: 42 } } });
    const out = await parseMercadoLibreEvents(
      { topic: "questions", resource: "/questions/1", user_id: "SELLER1" },
      env,
    );
    expect(out).toHaveLength(0);
  });

  it("ignora notificaciones de otro vendedor", async () => {
    const out = await parseMercadoLibreEvents(
      { topic: "questions", resource: "/questions/1", user_id: "OTRO" },
      env,
    );
    expect(out).toHaveLength(0);
  });

  it("convierte un mensaje post-venta del comprador (no el eco del vendedor)", async () => {
    mockFetchJson({
      "/messages/packs/PACK9/sellers/SELLER1": {
        messages: [
          { text: "eco del vendedor", from: { user_id: "SELLER1" }, to: { user_id: "BUYER7" } },
          { text: "¿ya lo enviaron?", from: { user_id: "BUYER7" }, to: { user_id: "SELLER1" } },
        ],
      },
    });
    const out = await parseMercadoLibreEvents(
      { topic: "messages", resource: "/messages/packs/PACK9/sellers/SELLER1", user_id: "SELLER1" },
      env,
    );
    expect(out).toHaveLength(1);
    expect(out[0].channelUserId).toBe("m:PACK9:BUYER7");
    expect(out[0].text).toBe("¿ya lo enviaron?");
  });

  it("devuelve [] si el canal no está conectado", async () => {
    (getMlAccessToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const out = await parseMercadoLibreEvents(
      { topic: "questions", resource: "/questions/1", user_id: "SELLER1" },
      env,
    );
    expect(out).toHaveLength(0);
  });
});

describe("mercadolibreAdapter.sendReply", () => {
  it("responde una pregunta con POST /answers", async () => {
    const fn = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fn);
    await mercadolibreAdapter.sendReply(
      { channel: "mercadolibre", channelUserId: "q:999:42", chunks: ["Sí", "hay stock"] },
      env,
    );
    const [url, init] = fn.mock.calls[0] as any[];
    expect(url).toBe("https://api.mercadolibre.com/answers");
    expect(init.headers.Authorization).toBe("Bearer AT");
    const payload = JSON.parse(init.body);
    expect(payload.question_id).toBe(999);
    expect(payload.text).toBe("Sí\n\nhay stock");
  });

  it("responde un mensaje post-venta al pack correcto", async () => {
    const fn = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fn);
    await mercadolibreAdapter.sendReply(
      { channel: "mercadolibre", channelUserId: "m:PACK9:BUYER7", chunks: ["Ya salió tu paquete"] },
      env,
    );
    const [url, init] = fn.mock.calls[0] as any[];
    expect(url).toBe(
      "https://api.mercadolibre.com/messages/packs/PACK9/sellers/SELLER1?tag=post_sale",
    );
    const payload = JSON.parse(init.body);
    expect(payload.from.user_id).toBe("SELLER1");
    expect(payload.to.user_id).toBe("BUYER7");
    expect(payload.text).toBe("Ya salió tu paquete");
  });

  it("lanza si el canal no está conectado", async () => {
    (getMlAccessToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(
      mercadolibreAdapter.sendReply(
        { channel: "mercadolibre", channelUserId: "q:1:2", chunks: ["hi"] },
        env,
      ),
    ).rejects.toThrow(/no está conectado/);
  });
});
