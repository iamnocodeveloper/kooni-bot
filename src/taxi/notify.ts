import type { Env } from "../env";
import type { ChannelId } from "../channels/shared";
import { Db } from "../db/client";
import { normalizePhone, type TaxiBase, type TaxiDriver, type TaxiTrip } from "../db/taxi";
import { ConversationsRepo } from "../db/conversations";
import { ConversationLabelsRepo, NEEDS_HUMAN_LABEL } from "../db/conversationLabels";
import { TicketsRepo } from "../db/tickets";

// Avisos del nicho TAXIS. Todo best-effort: nunca lanza hacia el flujo que lo
// llama (una notificación caída jamás puede tumbar un viaje).

const URGENT_PAUSE_MS = 60 * 60 * 1000; // 1 h: el operador retoma el chat

/** Cuál canal de WhatsApp usar para hablarle al conductor. */
async function taxiChannel(env: Env): Promise<ChannelId | null> {
  try {
    const { resolveWahaConfig } = await import("../channels/wahaCredentials");
    const cfg = await resolveWahaConfig(env);
    if (cfg.base) return "waha";
  } catch {
    if ((env.WAHA_API_URL ?? "").trim()) return "waha";
  }
  if ((env.WHATSAPP_ACCESS_TOKEN ?? "").trim() && (env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim()) {
    return "whatsapp";
  }
  return null;
}

/** Identificador del conductor en su canal (WAHA usa `<digits>@c.us`). */
function driverRecipient(channel: ChannelId, phone: string): string {
  const digits = normalizePhone(phone);
  return channel === "waha" ? `${digits}@c.us` : digits;
}

/** "Juan (Aveo AB123CD)" — cómo presentamos al conductor. */
export function driverLabel(driver: Pick<TaxiDriver, "name" | "vehicle" | "plate" | "code">): string {
  const name = (driver.name ?? "").trim() || `Conductor ${driver.code ?? ""}`.trim() || "Conductor";
  const car = [driver.vehicle, driver.plate].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return car ? `${name} (${car})` : name;
}

/** Texto que se le manda al cliente cuando ya tiene conductor. */
export function customerAssignedText(driver: TaxiDriver, base?: TaxiBase | null): string {
  const eta = base?.eta_min ? ` Llega en ~${base.eta_min} min.` : "";
  const tel = (driver.phone ?? "").trim();
  return (
    `¡Ya salió tu taxi! 🚕\n` +
    `Conductor: ${driverLabel(driver)}\n` +
    `Código: ${driver.code ?? "—"}${eta}` +
    (tel ? `\n\nPuede escribirte desde ${tel}.` : "")
  );
}

/** Le avisa al cliente por su mismo canal. Skip si el viaje no vino de un chat. */
export async function notifyCustomerAssigned(
  env: Env,
  trip: TaxiTrip,
  driver: TaxiDriver,
  base?: TaxiBase | null,
): Promise<boolean> {
  if (!trip.channel_user_id || !trip.channel) return false;
  try {
    const { sendReplyCapped } = await import("../replies/sender");
    await sendReplyCapped(trip.channel as ChannelId, trip.channel_user_id, [customerAssignedText(driver, base)], env);
    return true;
  } catch (e) {
    console.warn("[taxi] notifyCustomerAssigned:", e);
    return false;
  }
}

/** Texto del cambio de estado del viaje que se le manda al cliente. */
export function customerTripStatusText(trip: TaxiTrip, driver?: TaxiDriver | null): string {
  switch (trip.status) {
    case "asignado":
      return driver ? customerAssignedText(driver) : "Ya te asignamos un taxi 🚕";
    case "en_camino":
      return `Tu taxi va en camino 🚕${driver?.name ? ` — ${driver.name}` : ""}.`;
    case "completado":
      return "¡Gracias por viajar con nosotros! 🙌";
    case "cancelado":
      return "Tu solicitud de taxi fue cancelada. Si necesitás otro, escribinos por acá.";
    case "sin_conductor":
      return "Seguimos buscando un auto para vos; te aviso apenas se libere uno.";
    default:
      return `Tu solicitud de taxi cambió de estado: ${trip.status}.`;
  }
}

/** Le avisa al cliente por su canal el cambio de estado del viaje. */
export async function notifyCustomerTripStatus(env: Env, trip: TaxiTrip, driver?: TaxiDriver | null): Promise<void> {
  if (!trip.channel_user_id || !trip.channel) return;
  try {
    const { sendReplyCapped } = await import("../replies/sender");
    await sendReplyCapped(trip.channel as ChannelId, trip.channel_user_id, [customerTripStatusText(trip, driver)], env);
  } catch (e) {
    console.warn("[taxi] notifyCustomerTripStatus:", e);
  }
}

/** Le avisa al conductor que tiene un viaje (por su WhatsApp registrado). */
export async function notifyDriverAssigned(
  env: Env,
  trip: TaxiTrip,
  driver: TaxiDriver,
  base?: TaxiBase | null,
): Promise<boolean> {
  const phone = (driver.phone ?? "").trim();
  if (!phone) return false;
  const channel = await taxiChannel(env);
  if (!channel) return false;
  const where = trip.pickup_address || trip.zone || "ubicación del cliente";
  const dest = trip.dest_address ? `\nDestino: ${trip.dest_address}` : "";
  const tel = (trip.customer_phone ?? "").trim();
  const text =
    `🚕 Viaje asignado\nCliente: ${trip.customer_name || "sin nombre"}${tel ? ` (${tel})` : ""}\n` +
    `Origen: ${where}${dest}\nBase: ${base?.name ?? "—"}`;
  try {
    const { sendReplyCapped } = await import("../replies/sender");
    await sendReplyCapped(channel, driverRecipient(channel, phone), [text], env);
    return true;
  } catch (e) {
    console.warn("[taxi] notifyDriverAssigned:", e);
    return false;
  }
}

/** Avisa al dueño que entró una solicitud (push a la PWA). */
export async function notifyOwnerNewTrip(
  env: Env,
  trip: TaxiTrip,
  driver: TaxiDriver | null,
  base?: TaxiBase | null,
): Promise<void> {
  try {
    const { notifyOwnerPush } = await import("../push");
    const where = trip.pickup_address || trip.zone || "ubicación sin detalle";
    const who = driver ? driverLabel(driver) : "SIN CONDUCTOR — asignar a mano";
    await notifyOwnerPush(env, {
      title: driver ? "🚕 Nueva solicitud" : "🚨 Solicitud sin conductor",
      body: `${where} · ${who}`.slice(0, 160),
      url: "/admin/viajes",
    });
  } catch (e) {
    console.warn("[taxi] notifyOwnerNewTrip:", e);
  }
}

/**
 * Marca el chat como URGENTE cuando no hay conductores: crea ticket, pone la
 * etiqueta de atención humana, avisa al dueño y pausa el bot para que el
 * operador retome. Idempotente-ish: si ya hay etiqueta, no duplica el aviso.
 */
export async function markUrgent(
  env: Env,
  conversationId: string | null,
  trip: TaxiTrip,
  reason = "sin conductor disponible",
): Promise<string | null> {
  const db = new Db(env.DB);
  const tickets = new TicketsRepo(db);
  const where = trip.pickup_address || trip.zone || "ubicación sin detalle";
  const ticketId = await tickets
    .create({
      conversationId,
      category: "other",
      summary: `[taxi urgente] ${reason}: ${where}`.slice(0, 200),
      transcript: "",
    })
    .catch((e) => {
      console.warn("[taxi] markUrgent ticket:", e);
      return null;
    });

  if (conversationId) {
    const convs = new ConversationsRepo(db);
    if (ticketId) await convs.setOpenTicket(conversationId, ticketId).catch(() => {});
    await new ConversationLabelsRepo(db).add(conversationId, NEEDS_HUMAN_LABEL, "bot").catch(() => {});
    await convs.setPausedUntil(conversationId, Date.now() + URGENT_PAUSE_MS).catch(() => {});
  }

  try {
    const { notifyOwnerPush } = await import("../push");
    await notifyOwnerPush(env, {
      title: "🚨 Taxi sin conductor",
      body: `${where} — asigná un conductor a mano.`.slice(0, 160),
      url: "/admin/viajes",
    });
  } catch (e) {
    console.warn("[taxi] markUrgent push:", e);
  }

  return ticketId;
}
