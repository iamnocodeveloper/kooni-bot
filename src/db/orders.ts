import { Db } from "./client";

// Motor de pedidos del nicho RESTAURANTE. Tablas: orders / order_items /
// order_events (ver schema.sql). Solo se usan cuando BOT_NICHE=restaurante.

export type OrderStatus =
  | "recibido"
  | "confirmado"
  | "preparacion"
  | "camino"
  | "entregado"
  | "cancelado";

/** Estados en orden de avance. `cancelado` es terminal desde cualquiera. */
export const ORDER_FLOW: OrderStatus[] = [
  "recibido",
  "confirmado",
  "preparacion",
  "camino",
  "entregado",
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  recibido: "Recibido",
  confirmado: "Confirmado",
  preparacion: "En preparación",
  camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/** ¿Se puede pasar de `from` a `to`? Se permite avanzar 1+ pasos o cancelar. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (from === "entregado" || from === "cancelado") return false;
  if (to === "cancelado") return true;
  return ORDER_FLOW.indexOf(to) > ORDER_FLOW.indexOf(from);
}

export interface Order {
  id: string;
  conversation_id: string | null;
  channel: string;
  channel_user_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  delivery_zone: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: string | null;
  payment_proof_url: string | null;
  status: OrderStatus;
  notes: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  track_code: string | null;
  created_at: number;
  updated_at: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  qty: number;
  unit_price: number;
  notes: string | null;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  status: OrderStatus;
  note: string | null;
  at: number;
}

export interface NewOrderItem {
  productId?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  notes?: string | null;
}

export interface CreateOrderInput {
  conversationId?: string | null;
  channel: string;
  channelUserId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  deliveryZone?: string | null;
  deliveryFee?: number;
  paymentMethod?: string | null;
  paymentProofUrl?: string | null;
  notes?: string | null;
  items: NewOrderItem[];
}

function shortCode(): string {
  // 6 chars, sin caracteres ambiguos — sirve de nº de pedido y de token de la
  // página pública de seguimiento (/t/:code).
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (const b of buf) s += abc[b % abc.length];
  return s;
}

export class OrdersRepo {
  constructor(private readonly db: Db) {}

  /** Crea el pedido + sus ítems, calcula subtotal/total. Devuelve id y track_code. */
  async create(input: CreateOrderInput): Promise<{ id: string; trackCode: string }> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const trackCode = shortCode();
    const subtotal = input.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const deliveryFee = input.deliveryFee ?? 0;
    const total = subtotal + deliveryFee;

    await this.db.run(
      `INSERT INTO orders (
        id, conversation_id, channel, channel_user_id, customer_name, customer_phone,
        address, delivery_zone, subtotal, delivery_fee, total, payment_method,
        payment_proof_url, status, notes, track_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recibido', ?, ?, ?, ?)`,
      [
        id,
        input.conversationId ?? null,
        input.channel,
        input.channelUserId ?? null,
        input.customerName ?? null,
        input.customerPhone ?? null,
        input.address ?? null,
        input.deliveryZone ?? null,
        subtotal,
        deliveryFee,
        total,
        input.paymentMethod ?? null,
        input.paymentProofUrl ?? null,
        input.notes ?? null,
        trackCode,
        now,
        now,
      ],
    );

    for (const it of input.items) {
      await this.db.run(
        `INSERT INTO order_items (id, order_id, product_id, name, qty, unit_price, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), id, it.productId ?? null, it.name, it.qty, it.unitPrice, it.notes ?? null],
      );
    }

    await this.addEvent(id, "recibido", "pedido creado");
    return { id, trackCode };
  }

  async get(id: string): Promise<Order | null> {
    return this.db.first<Order>("SELECT * FROM orders WHERE id = ?", [id]);
  }

  async byTrackCode(code: string): Promise<Order | null> {
    return this.db.first<Order>("SELECT * FROM orders WHERE track_code = ?", [code]);
  }

  async items(orderId: string): Promise<OrderItem[]> {
    return this.db.all<OrderItem>(
      "SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid ASC",
      [orderId],
    );
  }

  async events(orderId: string): Promise<OrderEvent[]> {
    return this.db.all<OrderEvent>(
      "SELECT * FROM order_events WHERE order_id = ? ORDER BY at ASC",
      [orderId],
    );
  }

  async list(opts: { status?: OrderStatus; limit?: number; since?: number } = {}): Promise<Order[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status) { where.push("status = ?"); params.push(opts.status); }
    if (opts.since) { where.push("created_at >= ?"); params.push(opts.since); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(opts.limit ?? 100);
    return this.db.all<Order>(
      `SELECT * FROM orders ${clause} ORDER BY created_at DESC LIMIT ?`,
      params,
    );
  }

  /** Los pedidos "vivos" del panel (todo lo que no está entregado ni cancelado). */
  async active(): Promise<Order[]> {
    return this.db.all<Order>(
      "SELECT * FROM orders WHERE status NOT IN ('entregado','cancelado') ORDER BY created_at ASC",
    );
  }

  /**
   * Cambia el estado si la transición es válida. Devuelve el pedido actualizado
   * o null si la transición no aplica (sin tocar nada).
   */
  async setStatus(id: string, to: OrderStatus, note?: string): Promise<Order | null> {
    const order = await this.get(id);
    if (!order) return null;
    if (!canTransition(order.status, to)) return null;
    const now = Date.now();
    await this.db.run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", [to, now, id]);
    await this.addEvent(id, to, note ?? null);
    return { ...order, status: to, updated_at: now };
  }

  async setPaymentProof(id: string, url: string): Promise<void> {
    await this.db.run(
      "UPDATE orders SET payment_proof_url = ?, updated_at = ? WHERE id = ?",
      [url, Date.now(), id],
    );
  }

  async assignDriver(id: string, name: string, phone: string): Promise<void> {
    await this.db.run(
      "UPDATE orders SET driver_name = ?, driver_phone = ?, updated_at = ? WHERE id = ?",
      [name, phone, Date.now(), id],
    );
  }

  async addEvent(orderId: string, status: OrderStatus, note: string | null): Promise<void> {
    await this.db.run(
      "INSERT INTO order_events (id, order_id, status, note, at) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), orderId, status, note, Date.now()],
    );
  }
}
