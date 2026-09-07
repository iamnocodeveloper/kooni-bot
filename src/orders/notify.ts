import type { Env } from "../env";
import type { Order, OrderItem } from "../db/orders";
import type { ChannelId } from "../channels/shared";

// Avisos del pedido: al CLIENTE por su mismo canal en cada cambio de estado, y
// al DUEÑO cuando entra un pedido nuevo (push a la PWA — el sonido del local se
// engancha ahí en la Fase D — + DM de Telegram). Todo best-effort: nunca lanza.

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

function trackUrl(env: Env, order: Order): string | null {
  const base = (env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");
  return base && order.track_code ? `${base}/t/${order.track_code}` : null;
}

/** Texto que se le manda al cliente según el estado nuevo del pedido. */
export function customerStatusText(order: Order): string {
  const eta = order.status === "confirmado" || order.status === "preparacion";
  switch (order.status) {
    case "recibido":
      return `¡Recibimos tu pedido! Total ${money(order.total)}. Te confirmamos en un momento.`;
    case "confirmado":
      return `Tu pedido ${order.track_code ? `#${order.track_code} ` : ""}está confirmado ✅. Ya lo preparamos.${eta ? "" : ""}`;
    case "preparacion":
      return `Tu pedido ya está en preparación 👨‍🍳`;
    case "camino":
      return `Tu pedido va en camino 🛵${order.driver_name ? ` con ${order.driver_name}` : ""}. Llega en unos minutos.`;
    case "entregado":
      return `¡Pedido entregado! Gracias por tu compra 🙌`;
    case "cancelado":
      return `Tu pedido fue cancelado. Si tenés dudas, escribinos por acá.`;
    default:
      return `Tu pedido cambió de estado: ${order.status}.`;
  }
}

/** Le avisa al cliente por su canal. Skip si el pedido no vino de un chat. */
export async function notifyCustomerStatus(env: Env, order: Order): Promise<void> {
  if (!order.channel_user_id || order.channel === "web") return;
  try {
    const { sendReplyCapped } = await import("../replies/sender");
    const url = trackUrl(env, order);
    const buttons =
      url && order.status !== "entregado" && order.status !== "cancelado"
        ? [{ text: "Ver seguimiento", url }]
        : undefined;
    await sendReplyCapped(
      order.channel as ChannelId,
      order.channel_user_id,
      [customerStatusText(order)],
      env,
      { buttons },
    );
  } catch (e) {
    console.warn("[orders] notifyCustomerStatus:", e);
  }
}

/** Avisa al dueño de un pedido nuevo: push a la PWA + DM de Telegram. */
export async function notifyOwnerNewOrder(env: Env, order: Order, items: OrderItem[]): Promise<void> {
  const detalle = items.map((it) => `• ${it.qty}× ${it.name}`).join("\n");
  const dir = order.address ? `\n📍 ${order.address}` : order.delivery_zone ? `\n📍 retiro en local` : "";
  const summary =
    `#${order.track_code} · ${money(order.total)} · ${order.customer_name || "sin nombre"}` +
    dir + (detalle ? `\n${detalle}` : "");

  try {
    const { notifyOwnerPush } = await import("../push");
    await notifyOwnerPush(env, {
      title: `🍽️ Pedido nuevo · ${money(order.total)}`,
      body: summary.slice(0, 160),
      url: "/admin/pedidos",
    });
  } catch (e) {
    console.warn("[orders] notifyOwnerNewOrder push:", e);
  }

  try {
    const { resolveTelegramToken, resolveOwnerTelegramChatId } = await import(
      "../channels/telegramCredentials"
    );
    const tok = await resolveTelegramToken(env);
    const chat = await resolveOwnerTelegramChatId(env);
    if (tok && chat) {
      const base = (env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");
      await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text: `🍽️ Pedido nuevo\n${summary}\n💳 ${order.payment_method || "—"}${base ? `\n\nVer: ${base}/admin/pedidos` : ""}`,
        }),
      });
    }
  } catch (e) {
    console.warn("[orders] notifyOwnerNewOrder telegram:", e);
  }
}
