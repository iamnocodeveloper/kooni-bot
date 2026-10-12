import { describe, it, expect } from "vitest";
import { renderTrack } from "../../src/admin/views/track";
import type { Env } from "../../src/env";

type Row = Record<string, unknown>;

/** D1 stub mínimo: primer fragmento de SQL que matchea gana. */
function makeStubDb(matchers: Array<{ frag: string; first?: Row; all?: Row[] }> = []): D1Database {
  const handler = (sql: string) => {
    for (const m of matchers) if (sql.includes(m.frag)) return m;
    return { first: undefined, all: [] as Row[] };
  };
  const makeStmt = (sql: string) => {
    const matched = handler(sql);
    const stmt: any = {
      bind: () => stmt,
      first: async () => matched.first ?? null,
      all: async () => ({ results: matched.all ?? [] }),
      run: async () => ({}),
    };
    return stmt;
  };
  return { prepare: (sql: string) => makeStmt(sql) } as unknown as D1Database;
}

function makeEnv(db: D1Database): Env {
  return { DB: db, BUSINESS_NAME: "Taquería El Sol", BRAND_PRIMARY: "#ff8800" } as unknown as Env;
}

const ORDER = {
  id: "ord-1",
  track_code: "ABC234",
  status: "camino",
  created_at: Date.now() - 60_000,
  subtotal: 150,
  delivery_fee: 30,
  total: 180,
  address: "Calle 5 #10",
  delivery_zone: "Zona A",
  payment_method: "efectivo",
  driver_name: "Luis",
  customer_name: "Ana",
};

describe("renderTrack — página pública de seguimiento", () => {
  it("muestra código, estado, ítems y total de un pedido con envío", async () => {
    const db = makeStubDb([
      { frag: "FROM orders WHERE track_code", first: ORDER },
      { frag: "FROM order_items", all: [
        { id: "i1", order_id: "ord-1", product_id: null, name: "Taco al pastor", qty: 3, unit_price: 40, notes: "sin cebolla" },
        { id: "i2", order_id: "ord-1", product_id: null, name: "Agua", qty: 1, unit_price: 30, notes: null },
      ] },
      { frag: "FROM order_events", all: [
        { id: "e1", order_id: "ord-1", status: "recibido", note: null, at: Date.now() - 60_000 },
        { id: "e2", order_id: "ord-1", status: "camino", note: "repartidor asignado", at: Date.now() - 10_000 },
      ] },
    ]);
    const r = await renderTrack(makeEnv(db), "abc234");
    expect(r.status).toBe(200);
    expect(r.html).toContain("#ABC234");
    expect(r.html).toContain("En camino");
    expect(r.html).toContain("Taco al pastor");
    expect(r.html).toContain("sin cebolla");
    expect(r.html).toContain("$180");
    expect(r.html).toContain("Calle 5 #10");
    expect(r.html).toContain("Luis");
    expect(r.html).toContain("Taquería El Sol");
  });

  it("devuelve 404 con página amable si el código no existe", async () => {
    const r = await renderTrack(makeEnv(makeStubDb()), "ZZZZ99");
    expect(r.status).toBe(404);
    expect(r.html).toContain("no encontrado");
  });

  it("no se rompe con un código vacío", async () => {
    const r = await renderTrack(makeEnv(makeStubDb()), "  ");
    expect(r.status).toBe(404);
  });

  it("muestra un pedido cancelado sin barras de avance", async () => {
    const db = makeStubDb([
      { frag: "FROM orders WHERE track_code", first: { ...ORDER, status: "cancelado" } },
      { frag: "FROM order_items", all: [] },
      { frag: "FROM order_events", all: [{ id: "e1", order_id: "ord-1", status: "recibido", note: null, at: Date.now() }] },
    ]);
    const r = await renderTrack(makeEnv(db), "ABC234");
    expect(r.status).toBe(200);
    expect(r.html).toContain("Cancelado");
  });
});
