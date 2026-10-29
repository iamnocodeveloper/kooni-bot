/**
 * Regresión del ANÁLISIS IA del inventario.
 *
 * El bug real (cardaniel, 28–29/10): `analyzeInventory` le pasaba a
 * `generateText` la propiedad `.model.model` del `ResolvedModel`, que es
 * `undefined` → "Cannot read properties of undefined (reading
 * 'specificationVersion')" y 0 correcciones en todas las corridas. El primer
 * test es el candado: el modelo que llega al SDK tiene que ser el real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateTextMock = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

const MODEL = { specificationVersion: "v3", modelId: "claude-sonnet-test" };

vi.mock("../../src/llm/provider", () => ({
  createAnalysisModel: () => ({
    provider: "aisa",
    modelId: "claude-sonnet-test",
    model: MODEL,
    supportsPromptCache: false,
  }),
}));

import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import { loadVehicleStore, saveVehicleStore, type StoredVehicle } from "../../src/kb/inventory";
import { analyzeInventory } from "../../src/kb/analysis";
import type { Env } from "../../src/env";

const KEY = "vin:5XYPKDA58PG242135";

function vehicle(partial: Partial<StoredVehicle> = {}): StoredVehicle {
  return {
    key: KEY,
    vin: "5XYPKDA58PG242135",
    title: "2022 Kia Telluride SX",
    year: 2022,
    make: "Kia",
    model: "Telluride SX",
    trim: null,
    description: null,
    condition: "Usado",
    price: null,
    miles: null,
    listingUrl: "https://example.com/inventory/1",
    feedUrl: "https://example.com/inventory_sitemap",
    imageUrl: null,
    imgStatus: "pendiente",
    imgAt: null,
    changedAt: 0,
    ...partial,
  };
}

describe("analyzeInventory", () => {
  let env: Env;
  let db: Db;
  let repo: SettingsRepo;

  beforeEach(async () => {
    generateTextMock.mockReset();
    const mf = await createTestMiniflare();
    const d1 = (await mf.getD1Database("DB")) as any;
    db = new Db(d1);
    repo = new SettingsRepo(db);
    env = { DB: d1 } as unknown as Env;
    await repo.set(SETTING_KEYS.webSyncAnalysisEnabled, "1");
    await saveVehicleStore(db, { updatedAt: 0, vehicles: { [KEY]: vehicle() } });
  });

  it("pasa a generateText el MODELO real, no undefined (regresión specificationVersion)", async () => {
    generateTextMock.mockResolvedValueOnce({ text: "[]" });
    await analyzeInventory(env);

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const arg = generateTextMock.mock.calls[0][0] as { model: unknown };
    expect(arg.model).toBe(MODEL);
  });

  it("aplica correcciones válidas y las persiste en el store", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: JSON.stringify([{ key: KEY, price: 32900, miles: 31000 }]),
    });
    const out = await analyzeInventory(env);

    expect(out.applied).toBe(1);
    const store = await loadVehicleStore(db);
    expect(store.vehicles[KEY].price).toBe(32900);
    expect(store.vehicles[KEY].miles).toBe(31000);
  });

  it("si el modelo falla, no rompe y reporta el error", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("boom del proveedor"));
    const out = await analyzeInventory(env);

    expect(out.applied).toBe(0);
    expect(out.error).toContain("boom del proveedor");
  });

  it("con el toggle apagado no llama al modelo", async () => {
    await repo.set(SETTING_KEYS.webSyncAnalysisEnabled, "0");
    const out = await analyzeInventory(env);

    expect(out.skipped).toBe("análisis IA apagado");
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
