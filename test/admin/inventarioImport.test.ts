import { describe, it, expect } from "vitest";
import { adminApp } from "../../src/admin/routes";
import { renderInventario } from "../../src/admin/views/inventario";
import { SETTING_KEYS } from "../../src/db/settings";
import type { Env } from "../../src/env";

// D1 en memoria (sin Miniflare): solo entiende la tabla `settings`, que es donde
// vive el store de autos. Cualquier otra tabla responde vacía.
function fakeEnv(extra: Record<string, unknown> = {}) {
  const settings = new Map<string, string>();
  const d1 = {
    prepare(sql: string) {
      return {
        bind(...p: unknown[]) {
          return {
            first: async () =>
              /FROM settings WHERE key/i.test(sql) && settings.has(String(p[0])) ? { value: settings.get(String(p[0])) } : null,
            all: async () => ({ results: [] }),
            run: async () => {
              if (/INSERT INTO settings/i.test(sql)) settings.set(String(p[0]), String(p[1]));
              return {};
            },
          };
        },
      };
    },
  };
  const env = {
    DB: d1,
    DASHBOARD_PASSWORD: "x",
    BUSINESS_NAME: "AutoMax",
    BOT_LANGUAGE: "es",
    BOT_TIER: "pro",
    ...extra,
  } as unknown as Env;
  return { env, settings };
}

const AUTH = { Authorization: `Basic ${Buffer.from("admin:x").toString("base64")}` };
const CSV = [
  "vin,anio,marca,modelo,version,condicion,precio,millas,link,imagen",
  "1HGCM82633A004352,2022,Kia,Sorento,SX,usado,\"$28,500\",\"41,200\",,",
  "2HGCM82633A004353,2023,Toyota,Corolla,LE,nuevo,23000,0,,",
].join("\n");

async function post(env: Env, fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return adminApp.request(
    "/scraping/inventario/import",
    { method: "POST", headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" }, body },
    env,
  );
}

describe("POST /admin/scraping/inventario/import", () => {
  it("guarda los autos en el store (source=csv) y avisa cuántos entraron", async () => {
    const { env, settings } = fakeEnv();
    const res = await post(env, { csv: CSV });
    expect(res.status).toBe(302);
    const loc = decodeURIComponent(res.headers.get("location") ?? "");
    expect(loc).toContain("/admin/scraping/inventario?flash=");
    expect(loc).toContain("✓ 2 autos nuevos, 0 actualizados, 0 filas con problema");

    const store = JSON.parse(settings.get(SETTING_KEYS.webSyncVehicles)!);
    expect(Object.keys(store.vehicles).sort()).toEqual(["vin:1HGCM82633A004352", "vin:2HGCM82633A004353"]);
    expect(store.vehicles["vin:1HGCM82633A004352"]).toMatchObject({ title: "2022 Kia Sorento SX", price: 28500, source: "csv" });
  });

  it("no pierde la carga si falla el indexado de la KB (sin Vectorize/AI)", async () => {
    const { env, settings } = fakeEnv(); // sin env.AI ni VECTORIZE → indexDoc lanza
    const res = await post(env, { csv: CSV });
    expect(res.status).toBe(302);
    expect(settings.has(SETTING_KEYS.webSyncVehicles)).toBe(true);
  });

  it("reimportar con 'reemplazar' quita los vendidos", async () => {
    const { env, settings } = fakeEnv();
    await post(env, { csv: CSV });
    const only = CSV.split("\n").slice(0, 2).join("\n");
    await post(env, { csv: only, replace: "1" });
    expect(Object.keys(JSON.parse(settings.get(SETTING_KEYS.webSyncVehicles)!).vehicles)).toEqual(["vin:1HGCM82633A004352"]);
  });

  it("CSV vacío o sin filas válidas: avisa y no escribe nada", async () => {
    const { env, settings } = fakeEnv();
    const empty = await post(env, { csv: "   " });
    expect(decodeURIComponent(empty.headers.get("location") ?? "")).toContain("No pegaste nada");
    const bad = await post(env, { csv: "vin,anio,marca,modelo\n,,," });
    expect(decodeURIComponent(bad.headers.get("location") ?? "")).toContain("No se pudo importar ninguna fila");
    expect(settings.has(SETTING_KEYS.webSyncVehicles)).toBe(false);
  });

  it("exige sesión del panel", async () => {
    const { env } = fakeEnv();
    const res = await adminApp.request(
      "/scraping/inventario/import",
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "csv=x" },
      env,
    );
    expect([401, 302, 303]).toContain(res.status);
    expect(res.headers.get("location") ?? "").not.toContain("flash=");
  });
});

describe("vista /admin/scraping/inventario", () => {
  it("muestra el formulario de importar y el mensaje vacío cuando no hay autos", async () => {
    const { env } = fakeEnv();
    const html = await renderInventario(env, {});
    expect(html).toContain('action="/admin/scraping/inventario/import"');
    expect(html).toContain('name="csv"');
    expect(html).toContain('name="replace"');
    expect(html).toContain("vin,anio,marca,modelo,version,condicion,precio,millas,link,imagen");
    expect(html).toContain("Todavía no hay autos cargados");
  });

  it("lista los autos importados y escapa el mensaje que viene por la URL", async () => {
    const { env } = fakeEnv();
    await post(env, { csv: CSV });
    const html = await renderInventario(env, { flash: '✓ <script>alert("x")</script>' });
    expect(html).toContain("2022 Kia Sorento SX");
    expect(html).toContain("$28,500");
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("en el giro concesionario el menú marca Inventario como pestaña activa", async () => {
    const { env } = fakeEnv({ BOT_NICHE: "concesionario" });
    const html = await renderInventario(env, {});
    expect(html).toContain('href="/admin/scraping/inventario"');
    expect(html).toContain("Inventario");
  });
});
