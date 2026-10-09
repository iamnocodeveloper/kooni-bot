/**
 * enviarRecurso en modo prueba (ventana "Probar el bot"): sin canal, el recurso
 * NO se envía — se devuelve para previsualizarlo en el panel.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import { enviarRecursoTool } from "../../src/tools/enviarRecurso";

let env: any;
let settings: SettingsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  env = { DB: d1 };
  settings = new SettingsRepo(new Db(d1 as any));
  await settings.set(
    SETTING_KEYS.resourceLibrary,
    JSON.stringify({ ofertas: { kind: "image", url: "https://x/ofertas.jpg", caption: "Nuestras ofertas" } }),
  );
});

describe("enviarRecurso — modo prueba (sin canal)", () => {
  it("devuelve el recurso simulado sin enviarlo", async () => {
    const tool = enviarRecursoTool(env, () => null, () => null);
    const out = (await tool.execute!({ nombre: "ofertas" }, {} as any)) as any;
    expect(out.ok).toBe(true);
    expect(out.simulado).toBe(true);
    expect(out.enviado).toBe(false);
    expect(out.kind).toBe("image");
    expect(out.url).toBe("https://x/ofertas.jpg");
    expect(out.caption).toBe("Nuestras ofertas");
  });

  it("respeta el nombre sin distinguir mayúsculas", async () => {
    const tool = enviarRecursoTool(env, () => null, () => null);
    const out = (await tool.execute!({ nombre: "OFERTAS" }, {} as any)) as any;
    expect(out.nombre).toBe("ofertas");
  });

  it("devuelve no_encontrado con los nombres disponibles", async () => {
    const tool = enviarRecursoTool(env, () => null, () => null);
    const out = (await tool.execute!({ nombre: "noexiste" }, {} as any)) as any;
    expect(out.error).toBe("no_encontrado");
    expect(out.mensaje).toContain("ofertas");
  });
});
