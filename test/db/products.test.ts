import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { ProductsRepo } from "../../src/db/products";

let repo: ProductsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  repo = new ProductsRepo(new Db(d1 as any));
});

describe("ProductsRepo", () => {
  it("crea, lee y actualiza un producto", async () => {
    const id = await repo.create({ name: "Concha", price: 25, category: "pan dulce" });
    let p = await repo.get(id);
    expect(p?.name).toBe("Concha");
    expect(p?.active).toBe(1);

    await repo.update(id, { price: 28, description: "de vainilla" });
    p = await repo.get(id);
    expect(p?.price).toBe(28);
    expect(p?.description).toBe("de vainilla");
  });

  it("available() excluye los inactivos", async () => {
    const a = await repo.create({ name: "A", price: 10 });
    await repo.create({ name: "B", price: 20 });
    await repo.setActive(a, false);
    expect(await repo.available()).toHaveLength(1);
    expect(await repo.all()).toHaveLength(2);
  });

  it("ordena por categoría, sort_order y nombre", async () => {
    await repo.create({ name: "Zeta", price: 1, category: "b", sortOrder: 1 });
    await repo.create({ name: "Alfa", price: 1, category: "a", sortOrder: 2 });
    await repo.create({ name: "Beta", price: 1, category: "a", sortOrder: 1 });
    const names = (await repo.available()).map((p) => p.name);
    expect(names).toEqual(["Beta", "Alfa", "Zeta"]);
  });

  it("delete lo quita", async () => {
    const id = await repo.create({ name: "X", price: 5 });
    await repo.delete(id);
    expect(await repo.get(id)).toBeNull();
    expect(await repo.count()).toBe(0);
  });
});
