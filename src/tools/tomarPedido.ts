import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { OrdersRepo } from "../db/orders";
import { ProductsRepo } from "../db/products";
import type { RecursoCtx } from "./enviarRecurso";

// Tool del nicho RESTAURANTE. El modelo arma el pedido conversando (varios
// turnos) y llama a `tomarPedido` UNA sola vez, al final, con el pedido completo
// y ya confirmado por el cliente. La tool: reconcilia precios con el menú
// (`products`), crea el pedido (`orders`), y avisa al restaurante.

export function tomarPedidoTool(
  env: Env,
  getConversationId: () => string | null,
  getChannelCtx: () => RecursoCtx | null,
) {
  return tool({
    description:
      "Registra un PEDIDO ya confirmado por el cliente (delivery o retiro). " +
      "Úsala SOLO después de mostrar el resumen (ítems, subtotal, envío, total, " +
      "dirección, método de pago) y de que el cliente dijo un 'sí' explícito. " +
      "NO la uses para cotizar, ni si falta algún dato, ni si el cliente todavía " +
      "está eligiendo.",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            name: z.string().describe("nombre del producto tal como está en el menú"),
            qty: z.number().int().positive(),
            unitPrice: z.number().nonnegative().describe("precio unitario según el menú"),
            notes: z.string().optional().describe("ej. 'sin cebolla', 'término medio'"),
          }),
        )
        .min(1),
      customerName: z.string().optional(),
      customerPhone: z.string().optional().describe("teléfono/WhatsApp de contacto"),
      pickup: z.boolean().optional().describe("true si el cliente RETIRA en el local (sin envío)"),
      address: z.string().optional().describe("dirección completa con referencias; vacío si es retiro"),
      deliveryZone: z.string().optional().describe("nombre de la zona de entrega"),
      deliveryFee: z
        .number()
        .nonnegative()
        .default(0)
        .describe("costo de envío de esa zona (0 si es retiro). Sácalo de searchKb, no lo inventes."),
      paymentMethod: z.string().describe("efectivo | transferencia | tarjeta"),
      notes: z.string().optional().describe("nota general del pedido"),
    }),
    execute: async (input) => {
      const db = new Db(env.DB);
      const orders = new OrdersRepo(db);
      const ctx = getChannelCtx();

      // Reconciliar contra el menú cargado en el panel (si hay): evita que el
      // modelo invente precios o nombres. Si no hay menú cargado, se usa lo que
      // pasó el modelo (que salió de searchKb).
      const menu = await new ProductsRepo(db).available().catch(() => []);
      const norm = (s: string) => s.toLowerCase().trim();
      const items = input.items.map((it) => {
        const match =
          menu.find((p) => norm(p.name) === norm(it.name)) ??
          menu.find((p) => norm(p.name).includes(norm(it.name)) || norm(it.name).includes(norm(p.name)));
        return {
          productId: match?.id ?? null,
          name: match?.name ?? it.name,
          qty: it.qty,
          unitPrice: match ? match.price : it.unitPrice,
          notes: it.notes ?? null,
        };
      });

      const pickup = input.pickup === true;
      const { id, trackCode } = await orders.create({
        conversationId: getConversationId(),
        channel: ctx?.channel ?? "web",
        channelUserId: ctx?.channelUserId ?? null,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        address: pickup ? null : input.address ?? null,
        deliveryZone: pickup ? null : input.deliveryZone ?? null,
        deliveryFee: pickup ? 0 : input.deliveryFee ?? 0,
        paymentMethod: input.paymentMethod,
        notes: input.notes ?? null,
        items,
      });

      const order = await orders.get(id);
      try {
        const { notifyOwnerNewOrder } = await import("../orders/notify");
        await notifyOwnerNewOrder(env, order!, await orders.items(id));
      } catch (e) {
        console.warn("[tomarPedido] aviso al dueño falló:", e);
      }

      const base = (env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");
      return {
        ok: true,
        pedido: trackCode,
        total: order?.total,
        seguimiento: base ? `${base}/t/${trackCode}` : undefined,
        instruccion:
          `Pedido ${trackCode} registrado (total $${order?.total}). ` +
          `Decile al cliente el número de pedido y que el restaurante lo confirma en breve; ` +
          `de ahí en adelante recibe los avisos de estado solo.`,
      };
    },
  });
}
