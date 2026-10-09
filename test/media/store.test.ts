import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Miniflare } from "miniflare";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { putMedia, getMedia, maxMediaBytes } from "../../src/media/store";

// Almacén "auto": R2 si el binding MEDIA existe, si no D1 (media_assets).
describe("media/store", () => {
  let mf: Miniflare;
  let env: any;

  beforeAll(async () => {
    mf = await createTestMiniflare();
    env = {
      DB: await mf.getD1Database("DB"),
      DASHBOARD_PASSWORD: "test-pass",
      DASHBOARD_BASE_URL: "https://bot.test",
    };
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it("D1: guarda y recupera los bytes", async () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);
    const stored = await putMedia(env, bytes, { mime: "image/jpeg", name: "ofertas.jpg", kind: "image" });

    expect(stored.id).toBeTruthy();
    expect(stored.url).toMatch(/^https:\/\/bot\.test\/media\//);

    const got = await getMedia(env, stored.id);
    expect(got).not.toBeNull();
    expect(got!.mime).toBe("image/jpeg");
    expect(got!.name).toBe("ofertas.jpg");
    expect(Array.from(got!.bytes)).toEqual([10, 20, 30, 40]);
  });

  it("D1: devuelve null si no existe", async () => {
    expect(await getMedia(env, "no-existe")).toBeNull();
  });

  it("R2: usa el bucket cuando el binding MEDIA está presente", async () => {
    const store = new Map<string, Uint8Array>();
    const fakeR2: any = {
      put: async (key: string, value: Uint8Array) => { store.set(key, value); },
      get: async (key: string) => {
        const b = store.get(key);
        if (!b) return null;
        return { arrayBuffer: async () => b.buffer, httpMetadata: { contentType: "audio/ogg" }, customMetadata: { name: "hola.ogg" } };
      },
    };
    const r2env = { ...env, MEDIA: fakeR2 };

    const stored = await putMedia(r2env, new Uint8Array([1, 2]), { mime: "audio/ogg", name: "hola.ogg", kind: "audio" });
    expect(store.has(`recursos/${stored.id}`)).toBe(true);

    const got = await getMedia(r2env, stored.id);
    expect(got!.mime).toBe("audio/ogg");
    expect(got!.name).toBe("hola.ogg");
  });

  it("maxMediaBytes es mayor con R2", () => {
    expect(maxMediaBytes({ ...env, MEDIA: {} } as any)).toBeGreaterThan(maxMediaBytes(env));
  });
});
