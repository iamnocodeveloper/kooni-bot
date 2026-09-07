import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { OrdersRepo } from "../../src/db/orders";
import { ProductsRepo } from "../../src/db/products";
import { ConversationsRepo } from "../../src/db/conversations";
import { buildRestaurantReports, reportsToCsv } from "../../src/reports/restaurante";

let env: any;
let db: Db;
let orders: OrdersRepo;
let convs: ConversationsRepo;
const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 15);

async function seedOrder(over: { total?: number; ago?: number; phone?: string; name?: string; items?: any[]; conv?: boolean } = {}) {
  let conversationId: string | null = null;
  if (over.conv) {
    const c = await convs.getOrCreate("whatsapp", "cu" + Math.random());
    conversationId = c.id;
  }
  const { id } = await orders.create({
    conversationId,
    channel: "whatsapp",
    channelUserId: "u" + Math.random(),
    customerName: over.name ?? "Cliente",
    customerPhone: over.phone ?? "555" + Math.floor(Math.random() * 1000),
    address: "Calle X",
    deliveryFee: 30,
    paymentMethod: "efectivo",
    items: over.items ?? [{ name: "Plato", qty: 1, unitPrice: (over.total ?? 130) - 30 }],
  });
  // Empujar created_at al pasado si hace falta.
  if (over.ago) {
    await db.run("UPDATE orders SET created_at = ?, updated_at = ? WHERE id = ?", [now - over.ago, now - over.ago, id]);
  }
  return id;
}

beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
  orders = new OrdersRepo(db);
  convs = new ConversationsRepo(db);
  env = { DB: db.d1 };
});

describe("buildRestaurantReports", () => {
  it("arma los 6 reportes y CADA UNO trae una acción no vacía", async () => {
    await seedOrder({ total: 200, ago: 2 * DAY });
    await seedOrder({ total: 400, ago: 5 * DAY });
    const r = await buildRestaurantReports(env, { from: now - 30 * DAY, to: now });

    expect(r.ventas.total).toBe(600);
    expect(r.ventas.pedidos).toBe(2);
    for (const key of ["ventas", "ticket", "productos", "pico", "clientes", "salud"] as const) {
      expect(typeof (r as any)[key].action).toBe("string");
      expect((r as any)[key].action.length).toBeGreaterThan(10);
    }
  });

  it("ticket promedio = total / pedidos", async () => {
    await seedOrder({ total: 100, ago: DAY });
    await seedOrder({ total: 300, ago: DAY });
    const r = await buildRestaurantReports(env, { from: now - 30 * DAY, to: now });
    expect(r.ticket.avg).toBe(200);
  });

  it("productos sin venta: los del menú que nadie pidió", async () => {
    const prod = new ProductsRepo(db);
    await prod.create({ name: "Se vende", price: 50 });
    await prod.create({ name: "No se vende", price: 90 });
    await seedOrder({ ago: DAY, items: [{ name: "Se vende", qty: 3, unitPrice: 50 }] });
    const r = await buildRestaurantReports(env, { from: now - 30 * DAY, to: now });
    expect(r.productos.sinVenta).toContain("No se vende");
    expect(r.productos.sinVenta).not.toContain("Se vende");
    expect(r.productos.top[0].name).toBe("Se vende");
    expect(r.productos.action).toContain("No se vende");
  });

  it("clientes 'dejaron de pedir': ≥2 pedidos y el último entre 30 y 60 días atrás", async () => {
    await seedOrder({ phone: "999", name: "Perdido", total: 200, ago: 45 * DAY });
    await seedOrder({ phone: "999", name: "Perdido", total: 200, ago: 50 * DAY });
    await seedOrder({ phone: "111", name: "Activo", total: 100, ago: 3 * DAY });
    const r = await buildRestaurantReports(env, { from: now - 30 * DAY, to: now });
    expect(r.clientes.dejaron.map((c) => c.phone)).toContain("999");
    expect(r.clientes.dejaron.map((c) => c.phone)).not.toContain("111");
    expect(r.clientes.dejaronMonto).toBe(400);
    expect(r.clientes.action).toMatch(/no pide|se están yendo|30/i);
  });

  it("salud del bot: conversión y pedidos sin intervención humana", async () => {
    await seedOrder({ ago: DAY, conv: true });
    const r = await buildRestaurantReports(env, { from: now - 30 * DAY, to: now });
    expect(r.salud.pedidosBot).toBe(1);
    expect(r.salud.pedidosSinHumano).toBe(1); // sin ticket asociado
  });

  it("el CSV incluye una sección por reporte", async () => {
    await seedOrder({ ago: DAY });
    const r = await buildRestaurantReports(env, { from: now - 30 * DAY, to: now });
    const csv = reportsToCsv(r);
    for (const s of ["Ventas", "Ticket promedio", "Producto", "Pico", "Clientes", "Salud del bot"]) {
      expect(csv).toContain(s);
    }
  });
});
