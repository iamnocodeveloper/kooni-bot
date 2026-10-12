import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { OrdersRepo } from "../db/orders";
import { ProductsRepo } from "../db/products";
import { DeliveryZonesRepo } from "../db/deliveryZones";
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
      deliveryZone: z.string().optional().describe("nombre de la zona de entrega (debe ser una de las zonas configuradas)"),
      deliveryFee: z
        .number()
        .nonnegative()
        .default(0)
        .describe("costo de envío de esa zona. El sistema lo recalcula desde la zona configurada; no lo inventes."),
      paymentMethod: z.string().describe("efectivo | transferencia | tarjeta"),
      scheduledAt: z
        .string()
        .optional()
        .describe("si el cliente pidió el pedido PARA MÁS TARDE: fecha/hora en ISO 8601 (ej. '2026-10-12T20:30'). Vacío si es para ahora."),
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
      const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

      // Zonas de entrega configuradas en el panel: el envío y el mínimo salen de
      // la ZONA, no del modelo. Sin zonas cargadas → comportamiento anterior.
      let deliveryZone: string | null = null;
      let deliveryFee = 0;
      if (!pickup) {
        const zones = await new DeliveryZonesRepo(db).active().catch(() => []);
        if (zones.length > 0) {
          const zone = await new DeliveryZonesRepo(db).match(input.deliveryZone ?? "").catch(() => null);
          if (!zone) {
            return {
              ok: false,
              error: "zona_desconocida",
              zonas: zones.map((zn) => zn.name),
              instruccion:
                `La zona "${input.deliveryZone ?? "?"}" no está cubierta. Las zonas con entrega son: ` +
                `${zones.map((zn) => zn.name).join(", ")}. Ofrecé retiro en el local o pasá el chat a una ` +
                `persona (handoffHuman); NO registres el pedido con una zona inventada.`,
            };
          }
          if (zone.min_order > 0 && subtotal < zone.min_order) {
            return {
              ok: false,
              error: "minimo_no_alcanzado",
              minimo: zone.min_order,
              subtotal,
              instruccion:
                `El mínimo de pedido para ${zone.name} es $${zone.min_order} y el pedido suma $${subtotal}. ` +
                `Decile al cliente que agregue algo más (o cambiá a retiro si aplica). No registres el pedido todavía.`,
            };
          }
          deliveryZone = zone.name;
          deliveryFee = zone.fee;
        } else {
          deliveryZone = input.deliveryZone ?? null;
          deliveryFee = input.deliveryFee ?? 0;
        }
      }

      const { id, trackCode } = await orders.create({
        conversationId: getConversationId(),
        channel: ctx?.channel ?? "web",
        channelUserId: ctx?.channelUserId ?? null,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        address: pickup ? null : input.address ?? null,
        deliveryZone,
        deliveryFee,
        paymentMethod: input.paymentMethod,
        notes: input.notes ?? null,
        items,
      });

      const order = await orders.get(id);

      // Pedido programado (para más tarde): si el cliente dio una fecha/hora
      // válida, se guarda para que el panel muestre "para las HH:MM".
      const schedMs = input.scheduledAt ? Date.parse(input.scheduledAt) : NaN;
      if (Number.isFinite(schedMs)) {
        await orders.setSchedule(id, schedMs, null).catch(() => {});
      }
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
