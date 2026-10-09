/**
 * Tests de la Galería de recursos (/admin/recursos): subida de archivos (D1),
 * guardado en `resource_library` y borrado. D1 real vía miniflare.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { adminApp } from "../../src/admin/routes";
import { Db } from "../../src/db/client";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import { parseResourceLibrary } from "../../src/resources/library";
import type { Env } from "../../src/env";

const PASSWORD = "secret123";
const AUTH = { Authorization: `Basic ${Buffer.from(`admin:${PASSWORD}`).toString("base64")}` };

let env: Env;
let settings: SettingsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = (await mf.getD1Database("DB")) as any;
  env = {
    DB: d1,
    ANTHROPIC_API_KEY: "sk-test",
    BOT_NAME: "TestBot",
    BUSINESS_NAME: "Negocio",
    BOT_LANGUAGE: "es",
    BOT_TIER: "free",
    BUFFER_SECONDS: "8",
    DASHBOARD_PASSWORD: PASSWORD,
    DASHBOARD_BASE_URL: "https://bot.test",
  } as unknown as Env;
  settings = new SettingsRepo(new Db(d1));
});

describe("Galería de recursos", () => {
  it("renderiza la página", async () => {
    const res = await adminApp.request("/recursos", { headers: AUTH }, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Galería");
  });

  it("guarda un recurso por URL", async () => {
    const form = new FormData();
    form.set("name", "ofertas");
    form.set("kind", "image");
    form.set("url", "https://cdn.example.com/o.jpg");
    form.set("caption", "Nuestras ofertas");
    form.set("when", "cuando pidan ofertas");

    const res = await adminApp.request(
      "/recursos/save",
      { method: "POST", headers: AUTH, body: form },
      env,
    );
    expect(res.status).toBe(302);

    const lib = parseResourceLibrary(await settings.get(SETTING_KEYS.resourceLibrary));
    expect(lib.ofertas.kind).toBe("image");
    expect(lib.ofertas.url).toBe("https://cdn.example.com/o.jpg");
    expect(lib.ofertas.when).toBe("cuando pidan ofertas");
  });

  it("sube un archivo y guarda la URL firmada (kind desde el MIME)", async () => {
    const form = new FormData();
    form.set("name", "bienvenida");
    form.set("kind", "image");
    form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "hola.ogg", { type: "audio/ogg" }));
    form.set("asVoice", "on");

    const res = await adminApp.request(
      "/recursos/save",
      { method: "POST", headers: AUTH, body: form },
      env,
    );
    expect(res.status).toBe(302);

    const lib = parseResourceLibrary(await settings.get(SETTING_KEYS.resourceLibrary));
    expect(lib.bienvenida.kind).toBe("audio");
    expect(lib.bienvenida.asVoice).toBe(true);
    expect(lib.bienvenida.url).toMatch(/^https:\/\/bot\.test\/media\//);
  });

  it("borra un recurso", async () => {
    await settings.set(
      SETTING_KEYS.resourceLibrary,
      JSON.stringify({ ofertas: { kind: "image", url: "https://x/o.jpg" } }),
    );
    const form = new FormData();
    form.set("name", "ofertas");
    const res = await adminApp.request(
      "/recursos/delete",
      { method: "POST", headers: AUTH, body: form },
      env,
    );
    expect(res.status).toBe(302);
    const lib = parseResourceLibrary(await settings.get(SETTING_KEYS.resourceLibrary));
    expect(lib.ofertas).toBeUndefined();
  });
});
