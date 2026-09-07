import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { customerStatusText, notifyCustomerStatus } from "../../src/orders/notify";
import type { Order } from "../../src/db/orders";
import * as sender from "../../src/replies/sender";

const baseOrder = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  conversation_id: null,
  channel: "whatsapp",
  channel_user_id: "52155000",
  customer_name: "Ana",
  customer_phone: "52155000",
  address: "Calle 1",
  delivery_zone: "centro",
  subtotal: 200,
  delivery_fee: 30,
  total: 230,
  payment_method: "efectivo",
  payment_proof_url: null,
  status: "recibido",
  notes: null,
  driver_name: null,
  driver_phone: null,
  track_code: "AB12CD",
  created_at: 0,
  updated_at: 0,
  ...over,
});

describe("customerStatusText", () => {
  it("da un texto distinto y con sentido por cada estado", () => {
    expect(customerStatusText(baseOrder({ status: "recibido" }))).toContain("Recibimos");
    expect(customerStatusText(baseOrder({ status: "confirmado" }))).toContain("confirmado");
    expect(customerStatusText(baseOrder({ status: "preparacion" }))).toContain("preparación");
    expect(customerStatusText(baseOrder({ status: "camino", driver_name: "Beto" }))).toContain("Beto");
    expect(customerStatusText(baseOrder({ status: "entregado" }))).toContain("entregado");
    expect(customerStatusText(baseOrder({ status: "cancelado" }))).toContain("cancelado");
  });
});

describe("notifyCustomerStatus", () => {
  let spy: any;
  beforeEach(() => {
    spy = vi.spyOn(sender, "sendReplyCapped").mockResolvedValue({ dropped: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  const env = { DASHBOARD_BASE_URL: "https://bot.example" } as any;

  it("manda el mensaje por el canal del cliente con botón de seguimiento", async () => {
    await notifyCustomerStatus(env, baseOrder({ status: "confirmado" }));
    expect(spy).toHaveBeenCalledTimes(1);
    const [channel, userId, chunks, , opts] = spy.mock.calls[0];
    expect(channel).toBe("whatsapp");
    expect(userId).toBe("52155000");
    expect(chunks[0]).toContain("confirmado");
    expect(opts.buttons[0].url).toBe("https://bot.example/t/AB12CD");
  });

  it("sin botón de seguimiento cuando el pedido ya está entregado", async () => {
    await notifyCustomerStatus(env, baseOrder({ status: "entregado" }));
    expect(spy.mock.calls[0][4].buttons).toBeUndefined();
  });

  it("no manda nada si el pedido no vino de un chat (channel web / sin user id)", async () => {
    await notifyCustomerStatus(env, baseOrder({ channel: "web", channel_user_id: null }));
    await notifyCustomerStatus(env, baseOrder({ channel_user_id: null }));
    expect(spy).not.toHaveBeenCalled();
  });
});
