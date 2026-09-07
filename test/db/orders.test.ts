import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { OrdersRepo, canTransition } from "../../src/db/orders";

let repo: OrdersRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  repo = new OrdersRepo(new Db(d1 as any));
});

const sampleInput = {
  channel: "whatsapp",
  channelUserId: "521555000",
  customerName: "Ana",
  customerPhone: "521555000",
  address: "Calle 1 #2, depto 3",
  deliveryZone: "centro",
  deliveryFee: 30,
  paymentMethod: "transferencia",
  items: [
    { name: "Hamburguesa", qty: 2, unitPrice: 120 },
    { name: "Refresco", qty: 1, unitPrice: 25, notes: "sin hielo" },
  ],
};

describe("OrdersRepo.create", () => {
  it("calcula subtotal + envío = total y guarda los ítems", async () => {
    const { id, trackCode } = await repo.create(sampleInput);
    expect(trackCode).toMatch(/^[A-Z2-9]{6}$/);

    const order = await repo.get(id);
    expect(order?.subtotal).toBe(265); // 240 + 25
    expect(order?.delivery_fee).toBe(30);
    expect(order?.total).toBe(295);
    expect(order?.status).toBe("recibido");

    const items = await repo.items(id);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("Hamburguesa");
    expect(items[1].notes).toBe("sin hielo");
  });

  it("deja un evento 'recibido' al crear", async () => {
    const { id } = await repo.create(sampleInput);
    const events = await repo.events(id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("recibido");
  });

  it("se puede buscar por track_code (para la página de seguimiento)", async () => {
    const { trackCode } = await repo.create(sampleInput);
    const order = await repo.byTrackCode(trackCode);
    expect(order?.customer_name).toBe("Ana");
  });
});

describe("OrdersRepo.setStatus", () => {
  it("avanza por el flujo y registra cada cambio", async () => {
    const { id } = await repo.create(sampleInput);
    expect((await repo.setStatus(id, "confirmado"))?.status).toBe("confirmado");
    expect((await repo.setStatus(id, "camino"))?.status).toBe("camino"); // salta un paso: permitido
    const events = await repo.events(id);
    expect(events.map((e) => e.status)).toEqual(["recibido", "confirmado", "camino"]);
  });

  it("rechaza retroceder o repetir estado (devuelve null, no toca nada)", async () => {
    const { id } = await repo.create(sampleInput);
    await repo.setStatus(id, "preparacion");
    expect(await repo.setStatus(id, "confirmado")).toBeNull(); // retroceso
    expect(await repo.setStatus(id, "preparacion")).toBeNull(); // repetido
    expect((await repo.get(id))?.status).toBe("preparacion");
  });

  it("no se puede mover un pedido entregado ni cancelado", async () => {
    const { id } = await repo.create(sampleInput);
    await repo.setStatus(id, "entregado");
    expect(await repo.setStatus(id, "camino")).toBeNull();
    expect(await repo.setStatus(id, "cancelado")).toBeNull();
  });

  it("cancelar se permite desde cualquier estado activo", async () => {
    const { id } = await repo.create(sampleInput);
    await repo.setStatus(id, "preparacion");
    expect((await repo.setStatus(id, "cancelado"))?.status).toBe("cancelado");
  });
});

describe("OrdersRepo.list / active", () => {
  it("active() trae solo lo que no está entregado ni cancelado", async () => {
    const a = await repo.create(sampleInput);
    const b = await repo.create(sampleInput);
    await repo.create(sampleInput);
    await repo.setStatus(a.id, "entregado");
    await repo.setStatus(b.id, "cancelado");
    const active = await repo.active();
    expect(active).toHaveLength(1);
  });
});

describe("canTransition", () => {
  it("valida el flujo", () => {
    expect(canTransition("recibido", "confirmado")).toBe(true);
    expect(canTransition("recibido", "entregado")).toBe(true);
    expect(canTransition("confirmado", "recibido")).toBe(false);
    expect(canTransition("entregado", "camino")).toBe(false);
    expect(canTransition("preparacion", "cancelado")).toBe(true);
    expect(canTransition("recibido", "recibido")).toBe(false);
  });
});
