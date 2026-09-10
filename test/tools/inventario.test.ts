import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { inventarioQueryTool, fichaAutoTool } from "../../src/tools/inventario";
import { parseInventory, mergeVehicleStore, saveVehicleStore, loadVehicleStore } from "../../src/kb/inventory";
import type { Env } from "../../src/env";

const FEED = `-   [2022 Kia Telluride SX](https://www.greenwaykiawestpalmbeach.com/inventory/used/2022-kia-telluride-sx) New
    45,210 miles $46,990 VIN: 5XYPH4A56KG123456
-   [2020 Kia Sorento LX](https://www.greenwaykiawestpalmbeach.com/inventory/used/2020-kia-sorento-lx) Pre-Owned
    85,110 miles $17,593 VIN: 5XYPG4A38LG625285
-   [2021 Chevrolet Equinox LT](https://www.greenwaykiawestpalmbeach.com/inventory/used/2021-chevrolet-equinox-lt) Used
    33,004 miles $21,400 VIN: 2GNAXKEV9M6123456
-   [2022 Toyota Camry SE](https://www.greenwaykiawestpalmbeach.com/inventory/used/2022-toyota-camry-se) Certified
    22,100 miles $28,990 VIN: 4T1G11AK8NU123456`;

async function seed(d1: any): Promise<{ db: Db; sorentoKey: string }> {
  const db = new Db(d1);
  const vs = parseInventory(FEED, "https://www.greenwaykiawestpalmbeach.com/llm/inventory/");
  const store = mergeVehicleStore({ updatedAt: 0, vehicles: {} }, vs);
  await saveVehicleStore(db, store);
  const sorentoKey = vs.find((v) => v.vin === "5XYPG4A38LG625285")!.key;
  return { db, sorentoKey };
}

async function envWithStore(): Promise<{ env: Env; d1: any; sorentoKey: string }> {
  const mf = await createTestMiniflare();
  const d1 = (await mf.getD1Database("DB")) as any;
  const { sorentoKey } = await seed(d1);
  const env = { DB: d1, DECODO_AUTH: "user:pass" } as unknown as Env;
  return { env, d1, sorentoKey };
}

afterEach(() => vi.restoreAllMocks());

describe("inventarioQuery", () => {
  it("sin inventario cargado devuelve la guía (no fantasma)", async () => {
    const mf = await createTestMiniflare();
    const d1 = (await mf.getD1Database("DB")) as any;
    const tool = inventarioQueryTool({ DB: d1 } as unknown as Env);
    const execute = tool.execute as (input: Record<string, unknown>) => Promise<any>;
    const res = await execute({ marca: "Kia" });
    expect(res.sinInventario).toBe(true);
  });

  it("responde SOLO con lo que hay: marca real sí, marca inexistente no", async () => {
    const { env } = await envWithStore();
    const tool = inventarioQueryTool(env);
    const execute = tool.execute as (input: Record<string, unknown>) => Promise<any>;

    const kia = await execute({ marca: "Kia" });
    expect(kia.encontrados).toBe(2);
    expect(kia.matches.map((m: { titulo: string }) => m.titulo)).toContain("2020 Kia Sorento LX");

    const mazda = await execute({ marca: "Mazda" });
    expect(mazda.encontrados).toBe(0);
    expect(mazda.marcasDisponibles).toContain("Kia (2)");
  });

  it("filtra por rango de precio y condición; incluye el total", async () => {
    const { env } = await envWithStore();
    const tool = inventarioQueryTool(env);
    const execute = tool.execute as (input: Record<string, unknown>) => Promise<any>;

    const baratos = await execute({ precioMax: 20000 });
    expect(baratos.encontrados).toBe(1);
    expect(baratos.matches[0].titulo).toBe("2020 Kia Sorento LX");

    const usados = await execute({ condicion: "usado" });
    expect(usados.encontrados).toBe(3); // Usado + Certificado cuentan como usados
  });
});

describe("fichaAuto", () => {
  it("no encontrado por VIN → error (el bot no inventa)", async () => {
    const { env } = await envWithStore();
    const tool = fichaAutoTool(env, () => null);
    const execute = tool.execute as (input: Record<string, unknown>) => Promise<any>;
    const res = await execute({ vin: "5XYPG4A38LG6252XX" });
    expect(res.error).toBe("no_encontrado");
  });

  it("título ambiguo pide elegir (candidatos, sin mandar la foto equivocada)", async () => {
    const { env } = await envWithStore();
    const tool = fichaAutoTool(env, () => null);
    const execute = tool.execute as (input: Record<string, unknown>) => Promise<any>;
    const res = await execute({ auto: "Kia" });
    expect(res.error).toBe("ambiguo");
    expect(res.candidatos.length).toBeGreaterThan(1);
  });

  it("con VIN devuelve la ficha real (link del store) y cachea la foto de la ficha vía Decodo", async () => {
    const { env, d1, sorentoKey } = await envWithStore();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ results: [{ content: "![Kia Sorento](https://cdn.greenway.com/sorento.jpg)", status_code: 200 }] }),
          { status: 200 },
        ),
      ),
    );
    const tool = fichaAutoTool(env, () => null);
    const execute = tool.execute as (input: Record<string, unknown>) => Promise<any>;
    const res = await execute({ vin: "5XYPG4A38LG625285" });

    expect(res.ok).toBe(true);
    expect(res.ficha).toMatchObject({
      titulo: "2020 Kia Sorento LX",
      precio: 17593,
      url: "https://www.greenwaykiawestpalmbeach.com/inventory/used/2020-kia-sorento-lx",
    });
    expect(res.foto.enviada).toBe(false); // sin ctx de canal (no hay a quién mandarle)

    const store = await loadVehicleStore(new Db(d1));
    expect(store.vehicles[sorentoKey].imgStatus).toBe("ok");
    expect(store.vehicles[sorentoKey].imageUrl).toBe("https://cdn.greenway.com/sorento.jpg");
  });

  it("sin store devuelve sinInventario (usa searchKb)", async () => {
    const mf = await createTestMiniflare();
    const d1 = (await mf.getD1Database("DB")) as any;
    const tool = fichaAutoTool({ DB: d1, DECODO_AUTH: "user:pass" } as unknown as Env, () => null);
    const execute = tool.execute as (input: Record<string, unknown>) => Promise<any>;
    const res = await execute({ vin: "5XYPG4A38LG625285" });
    expect(res.sinInventario).toBe(true);
  });
});
