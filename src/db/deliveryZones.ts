import { Db } from "./client";

// Zonas de entrega del nicho RESTAURANTE (tabla `delivery_zones`). Definen el
// costo de envío y el mínimo de pedido POR ZONA, editables desde el panel
// (/admin/zonas). `tomarPedido` los resuelve desde acá en vez de confiar en el
// texto de la KB. Si no hay zonas cargadas, el bot sigue funcionando como antes.

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  min_order: number;
  notes: string | null;
  active: number; // 0 | 1
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface DeliveryZoneInput {
  name: string;
  fee?: number;
  minOrder?: number;
  notes?: string | null;
  active?: boolean;
  sortOrder?: number;
}

const norm = (s: string) => s.toLowerCase().trim();

export class DeliveryZonesRepo {
  constructor(private readonly db: Db) {}

  async create(input: DeliveryZoneInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO delivery_zones (id, name, fee, min_order, notes, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.fee ?? 0,
        input.minOrder ?? 0,
        input.notes ?? null,
        input.active === false ? 0 : 1,
        input.sortOrder ?? 0,
        now,
        now,
      ],
    );
    return id;
  }

  async update(id: string, input: Partial<DeliveryZoneInput>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => { sets.push(`${col} = ?`); params.push(val); };
    if (input.name !== undefined) push("name", input.name);
    if (input.fee !== undefined) push("fee", input.fee);
    if (input.minOrder !== undefined) push("min_order", input.minOrder);
    if (input.notes !== undefined) push("notes", input.notes ?? null);
    if (input.active !== undefined) push("active", input.active ? 1 : 0);
    if (input.sortOrder !== undefined) push("sort_order", input.sortOrder);
    if (!sets.length) return;
    push("updated_at", Date.now());
    params.push(id);
    await this.db.run(`UPDATE delivery_zones SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.db.run(
      "UPDATE delivery_zones SET active = ?, updated_at = ? WHERE id = ?",
      [active ? 1 : 0, Date.now(), id],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.run("DELETE FROM delivery_zones WHERE id = ?", [id]);
  }

  async get(id: string): Promise<DeliveryZone | null> {
    return this.db.first<DeliveryZone>("SELECT * FROM delivery_zones WHERE id = ?", [id]);
  }

  /** Todas las zonas para el panel (activas e inactivas). */
  async all(): Promise<DeliveryZone[]> {
    return this.db.all<DeliveryZone>("SELECT * FROM delivery_zones ORDER BY sort_order, name");
  }

  /** Zonas activas — las que el bot puede ofrecer. */
  async active(): Promise<DeliveryZone[]> {
    return this.db.all<DeliveryZone>(
      "SELECT * FROM delivery_zones WHERE active = 1 ORDER BY sort_order, name",
    );
  }

  async count(): Promise<number> {
    const r = await this.db.first<{ n: number }>("SELECT COUNT(*) as n FROM delivery_zones");
    return r?.n ?? 0;
  }

  /**
   * Busca una zona activa por nombre (exacto primero, luego contención en
   * cualquiera de los dos sentidos). Devuelve null si no hay match.
   */
  async match(query: string): Promise<DeliveryZone | null> {
    const zones = await this.active();
    const q = norm(query);
    return (
      zones.find((z) => norm(z.name) === q) ??
      zones.find((z) => norm(z.name).includes(q) || q.includes(norm(z.name))) ??
      null
    );
  }
}
