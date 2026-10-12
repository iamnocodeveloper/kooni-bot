import { describe, it, expect, vi } from "vitest";

// Mock the member config import
vi.mock("../../member/config.local", () => ({
  catalog: [
    { name: "Concha", price: 25, description: "Pan dulce clásico" },
    { name: "Pan de muerto", price: 45, description: "Solo en temporada" },
  ],
}));

import { catalogQueryTool } from "../../src/tools/catalogQuery";

type Row = Record<string, unknown>;

/** D1 stub mínimo: `FROM products` devuelve el menú dado; `bind` es no-op. */
function makeEnv(products: Row[]) {
  const stmt: any = {
    bind: () => stmt,
    first: async () => null,
    all: async () => ({ results: products }),
    run: async () => ({}),
  };
  const DB = { prepare: () => stmt } as unknown as D1Database;
  return { DB } as any;
}

describe("catalogQueryTool — catálogo estático (sin menú en el panel)", () => {
  it("returns matching products by fuzzy name", async () => {
    const tool = catalogQueryTool({} as any);
    const result = (await tool.execute!({ query: "concha" }, {} as any)) as {
      matches: { name: string; price: number; description?: string; sku?: string }[];
    };
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].name).toBe("Concha");
  });

  it("returns empty matches when nothing matches", async () => {
    const tool = catalogQueryTool({} as any);
    const result = (await tool.execute!({ query: "xyzabc" }, {} as any)) as {
      matches: { name: string; price: number; description?: string; sku?: string }[];
    };
    expect(result.matches).toHaveLength(0);
  });
});

describe("catalogQueryTool — menú del panel (tabla products)", () => {
  const menu = [
    { id: "1", name: "Taco al pastor", description: "Con piña", price: 40, category: "Tacos", image_url: "http://x/taco.jpg", active: 1 },
    { id: "2", name: "Quesadilla", description: null, price: 35, category: "Tacos", image_url: null, active: 1 },
    { id: "3", name: "Agua de horchata", description: "Bebida", price: 30, category: "Bebidas", image_url: null, active: 1 },
  ];

  it("usa el menú del panel cuando hay productos cargados", async () => {
    const tool = catalogQueryTool(makeEnv(menu));
    const r = (await tool.execute!({ query: "pastor" }, {} as any)) as {
      matches: { name: string; price: number; imageUrl?: string; category?: string }[];
    };
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].name).toBe("Taco al pastor");
    expect(r.matches[0].price).toBe(40);
    expect(r.matches[0].imageUrl).toBe("http://x/taco.jpg");
    expect(r.matches[0].category).toBe("Tacos");
  });

  it("matchea por categoría", async () => {
    const tool = catalogQueryTool(makeEnv(menu));
    const r = (await tool.execute!({ query: "bebidas" }, {} as any)) as { matches: { name: string }[] };
    expect(r.matches.map((m) => m.name)).toContain("Agua de horchata");
  });

  it("no devuelve matches del menú si nada coincide", async () => {
    const tool = catalogQueryTool(makeEnv(menu));
    const r = (await tool.execute!({ query: "sushi" }, {} as any)) as { matches: unknown[] };
    expect(r.matches).toHaveLength(0);
  });
});
