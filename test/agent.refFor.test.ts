import { describe, it, expect, vi } from "vitest";

// `SupportAgent` (mismo módulo que `refFor`) extends `Agent` de la SDK
// `agents`, que importa el módulo virtual `cloudflare:workers` — el loader ESM
// de Node no resuelve el esquema `cloudflare:` fuera de workerd. Mismo mock
// que `test/agent.media.test.ts` para poder importar el módulo en Node.
vi.mock("agents", () => ({
  Agent: class {},
}));

import { refFor, stripRef } from "../src/agent";

describe("refFor (§V Fase 2 — referencia guardada en [IMAGE_URL:.../AUDIO_URL:...])", () => {
  it("WAHA se marca con el prefijo waha: para que el panel sepa proxyarlo", () => {
    expect(refFor("waha", "http://waha.local/api/files/x.jpg")).toBe("waha:http://waha.local/api/files/x.jpg");
  });

  it("cualquier otro canal guarda la URL tal cual", () => {
    expect(refFor("telegram", "https://api.telegram.org/file/bot123/x.jpg")).toBe(
      "https://api.telegram.org/file/bot123/x.jpg",
    );
    expect(refFor("whatsapp", "https://bot.test/webhooks/whatsapp/media/1?exp=1&sig=a")).toBe(
      "https://bot.test/webhooks/whatsapp/media/1?exp=1&sig=a",
    );
    expect(refFor("zernio", "https://cdn.zernio.test/x.jpg")).toBe("https://cdn.zernio.test/x.jpg");
  });
});

describe("stripRef (inverso de refFor — usado antes de la visión IA)", () => {
  it("quita el prefijo waha: para volver a una URL fetcheable", () => {
    expect(stripRef("waha:http://waha.local/api/files/x.jpg")).toBe("http://waha.local/api/files/x.jpg");
  });

  it("no toca nada si no hay prefijo waha:", () => {
    expect(stripRef("https://api.telegram.org/file/bot123/x.jpg")).toBe("https://api.telegram.org/file/bot123/x.jpg");
  });

  it("round-trip: stripRef(refFor(url)) === url para cualquier canal", () => {
    const url = "http://waha.local/api/files/x.jpg";
    expect(stripRef(refFor("waha", url))).toBe(url);
    expect(stripRef(refFor("telegram", url))).toBe(url);
  });
});
