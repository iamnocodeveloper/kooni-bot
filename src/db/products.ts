import { Db } from "./client";

// Menú del nicho RESTAURANTE. Tabla `products` (ver schema.sql), editable desde
// el panel (/admin/menu). Para este nicho reemplaza al array `catalog` de
// member/config.local.ts. Lo consultan: la tool tomarPedido, catalogQuery, el
// menú web público y el reporte de productos.

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  image_url: string | null;
  active: number; // 0 | 1
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface ProductInput {
  name: string;
  price: number;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export class ProductsRepo {
  constructor(private readonly db: Db) {}

  async create(input: ProductInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO products (id, name, description, price, category, image_url, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.description ?? null,
        input.price,
        input.category ?? null,
        input.imageUrl ?? null,
        input.active === false ? 0 : 1,
        input.sortOrder ?? 0,
        now,
        now,
      ],
    );
    return id;
  }

  async update(id: string, input: Partial<ProductInput>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => { sets.push(`${col} = ?`); params.push(val); };
    if (input.name !== undefined) push("name", input.name);
    if (input.description !== undefined) push("description", input.description ?? null);
    if (input.price !== undefined) push("price", input.price);
    if (input.category !== undefined) push("category", input.category ?? null);
    if (input.imageUrl !== undefined) push("image_url", input.imageUrl ?? null);
    if (input.active !== undefined) push("active", input.active ? 1 : 0);
    if (input.sortOrder !== undefined) push("sort_order", input.sortOrder);
    if (!sets.length) return;
    push("updated_at", Date.now());
    params.push(id);
    await this.db.run(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.db.run(
      "UPDATE products SET active = ?, updated_at = ? WHERE id = ?",
      [active ? 1 : 0, Date.now(), id],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.run("DELETE FROM products WHERE id = ?", [id]);
  }

  async get(id: string): Promise<Product | null> {
    return this.db.first<Product>("SELECT * FROM products WHERE id = ?", [id]);
  }

  /** Todo el menú para el panel (activos e inactivos). */
  async all(): Promise<Product[]> {
    return this.db.all<Product>(
      "SELECT * FROM products ORDER BY category, sort_order, name",
    );
  }

  /** Solo lo que se puede pedir hoy — para la tool, catalogQuery y el menú web. */
  async available(): Promise<Product[]> {
    return this.db.all<Product>(
      "SELECT * FROM products WHERE active = 1 ORDER BY category, sort_order, name",
    );
  }

  async count(): Promise<number> {
    const r = await this.db.first<{ n: number }>("SELECT COUNT(*) as n FROM products");
    return r?.n ?? 0;
  }
}
