import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMediaBytes } from "../../src/media/fetchRef";

// `fetchMediaBytes` es lo que hace que el bot "vea" y "escuche" en canales con
// credencial: WAHA exige `X-Api-Key` y Telegram lleva el token en la URL
// (enmascarado). Sin esto, el fetch anónimo daba 401/403 y el modelo no recibía
// ni la foto ni el audio.
describe("fetchMediaBytes — credenciales por canal", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function stubFetch(): any {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Uint8Array([1, 2, 3])));
    globalThis.fetch = fn as any;
    return fn;
  }

  it("WAHA: agrega el header X-Api-Key y quita el prefijo waha:", async () => {
    const fn = stubFetch();
    const env: any = { WAHA_API_KEY: "secreto" };

    const { bytes, contentType } = await fetchMediaBytes(
      "waha:http://waha.local/api/files/x.jpg",
      env,
    );

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe("http://waha.local/api/files/x.jpg");
    expect(fn.mock.calls[0][1].headers["X-Api-Key"]).toBe("secreto");
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(contentType).toBe("application/octet-stream");
  });

  it("WAHA: reescribe el origen local (localhost) al base configurado", async () => {
    const fn = stubFetch();
    const env: any = { WAHA_API_URL: "http://waha.host:3000", WAHA_API_KEY: "secreto" };

    await fetchMediaBytes("waha:http://localhost:80/api/files/cars/x.oga", env);

    // El host local de WAHA no existe desde el Worker → se usa el base configurado.
    expect(fn.mock.calls[0][0]).toBe("http://waha.host:3000/api/files/cars/x.oga");
    expect(fn.mock.calls[0][1].headers["X-Api-Key"]).toBe("secreto");
  });

  it("WAHA: deja intacta una URL con host real", async () => {
    const fn = stubFetch();
    const env: any = { WAHA_API_URL: "http://waha.host:3000" };

    await fetchMediaBytes("waha:http://otro.host/api/files/x.jpg", env);

    expect(fn.mock.calls[0][0]).toBe("http://otro.host/api/files/x.jpg");
  });

  it("Telegram: repone el token enmascarado antes del fetch", async () => {
    const fn = stubFetch();
    const env: any = { TELEGRAM_BOT_TOKEN: "123:ABC" };

    await fetchMediaBytes(
      "https://api.telegram.org/file/bot__TOKEN__/photos/x.jpg",
      env,
    );

    expect(fn.mock.calls[0][0]).toBe(
      "https://api.telegram.org/file/bot123:ABC/photos/x.jpg",
    );
    expect(fn.mock.calls[0][1].headers).toEqual({});
  });

  it("URL pública: pasa sin headers", async () => {
    const fn = stubFetch();

    await fetchMediaBytes("https://cdn.example.com/pic.png", {} as any);

    expect(fn.mock.calls[0][0]).toBe("https://cdn.example.com/pic.png");
    expect(fn.mock.calls[0][1].headers).toEqual({});
  });

  it("lanza si el fetch no es ok", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 403 })) as any;

    await expect(
      fetchMediaBytes("waha:http://waha.local/api/files/x.jpg", {} as any),
    ).rejects.toThrow("media fetch failed: 403");
  });
});
