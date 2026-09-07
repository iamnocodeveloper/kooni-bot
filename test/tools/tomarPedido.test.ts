import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { OrdersRepo } from "../../src/db/orders";
import { ProductsRepo } from "../../src/db/products";
import { tomarPedidoTool } from "../../src/tools/tomarPedido";

let env: any;
let db: Db;
let orders: OrdersRepo;
const ctx = { channel: "whatsapp" as const, channelUserId: "52155999" };

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  db = new Db(d1 as any);
  orders = new OrdersRepo(db);
  env = { DB: d1, DASHBOARD_BASE_URL: "https://bot.example" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

const run = (input: any) =>
  tomarPedidoTool(env, () => null, () => ctx).execute!(input, {} as any) as Promise<any>;

describe("tomarPedidoTool", () => {
  it("crea el pedido con total = subtotal + envío y devuelve el track code", async () => {
    const r = await run({
      items: [
        { name: "Pizza", qty: 1, unitPrice: 200 },
        { name: "Gaseosa", qty: 2, unitPrice: 30 },
      ],
      customerName: "Leo",
      address: "Av. Siempre Viva 742",
      deliveryZone: "centro",
      deliveryFee: 40,
      paymentMethod: "efectivo",
    });
    expect(r.ok).toBe(true);
    expect(r.pedido).toMatch(/^[A-Z2-9]{6}$/);
    expect(r.total).toBe(300); // 200 + 60 + 40
    expect(r.seguimiento).toBe(`https://bot.example/t/${r.pedido}`);

    const list = await orders.list();
    expect(list).toHaveLength(1);
    expect(list[0].customer_name).toBe("Leo");
    expect(list[0].status).toBe("recibido");
  });

  it("reconcilia el precio contra el menú cargado (no usa el del modelo)", async () => {
    await new ProductsRepo(db).create({ name: "Hamburguesa clásica", price: 150 });
    const r = await run({
      items: [{ name: "hamburguesa", qty: 2, unitPrice: 999 }], // el modelo se equivocó
      paymentMethod: "transferencia",
      pickup: true,
    });
    const order = await orders.byTrackCode(r.pedido);
    const items = await orders.items(order!.id);
    expect(items[0].name).toBe("Hamburguesa clásica");
    expect(items[0].unit_price).toBe(150);
    expect(order!.total).toBe(300); // 2 × 150, sin envío (pickup)
  });

  it("pickup=true fuerza envío 0 y sin dirección", async () => {
    const r = await run({
      items: [{ name: "Café", qty: 1, unitPrice: 50 }],
      address: "no debería guardarse",
      deliveryFee: 99,
      pickup: true,
      paymentMethod: "efectivo",
    });
    const order = await orders.byTrackCode(r.pedido);
    expect(order!.delivery_fee).toBe(0);
    expect(order!.address).toBeNull();
  });

  it("avisa al dueño (push encolado / intento de Telegram)", async () => {
    // Sin VAPID configurado el push no manda, pero con token de Telegram en
    // settings intentaría el DM. Acá solo verificamos que no truena.
    await expect(
      run({ items: [{ name: "X", qty: 1, unitPrice: 10 }], paymentMethod: "efectivo", pickup: true }),
    ).resolves.toMatchObject({ ok: true });
  });
});
