import type { Env } from "../env";
import type { IncomingMessage } from "../channels/shared";
import { Db } from "../db/client";
import { TaxiBasesRepo, TaxiDriversRepo, TaxiQueueRepo, type TaxiDriver } from "../db/taxi";
import { parseDriverCommand } from "./dispatch";

// Los conductores NO pasan por el modelo: cuando escriben desde su WhatsApp
// registrado, el bot los reconoce y los mete a la cola de su base (o los saca).
// Se engancha en los webhooks de WhatsApp/WAHA ANTES de `ingest`, así no aparecen
// como conversaciones de cliente en el CRM.

const TAXI_CHANNELS = new Set(["whatsapp", "waha"]);

/**
 * ¿Este entrante es de un conductor registrado del nicho de taxis? Si sí, lo
 * atiende (encola/saca/estado) y responde por su canal. Devuelve `true` cuando
 * lo manejó — el llamador NO debe seguir con el agente.
 */
export async function handleDriverMessage(env: Env, msg: IncomingMessage): Promise<boolean> {
  if ((env.BOT_NICHE ?? "").trim().toLowerCase() !== "taxis") return false;
  if (!TAXI_CHANNELS.has(msg.channel)) return false;

  const db = new Db(env.DB);
  const driver = await new TaxiDriversRepo(db).byPhone(msg.channelUserId).catch(() => null);
  if (!driver) return false;

  const reply = await driverReply(db, driver, msg.text).catch((e) => {
    console.warn("[taxi] driver command falló:", e);
    return "Hubo un problema al registrar tu mensaje. Probá de nuevo en un momento.";
  });

  try {
    const { sendReplyCapped } = await import("../replies/sender");
    await sendReplyCapped(msg.channel, msg.channelUserId, [reply], env);
  } catch (e) {
    console.warn("[taxi] respuesta al conductor falló:", e);
  }
  return true;
}

async function driverReply(db: Db, driver: TaxiDriver, text: string | undefined): Promise<string> {
  const queue = new TaxiQueueRepo(db);
  const command = parseDriverCommand(text);

  if (command === "leave") {
    await queue.leave(driver.id);
    return "Listo, saliste de la cola. Cuando llegues de nuevo, escribime y volvés a entrar.";
  }

  if (command === "finish") {
    const entry = await queue.activeEntryForDriver(driver.id);
    if (!entry) return "No tenías un viaje en curso.";
    await queue.finish(entry.id);
    return "Anotado: viaje terminado. Si volvés a la base, escribime para entrar a la cola.";
  }

  if (command === "status") return statusReply(db, driver);

  // Por defecto: "llegué a la base" → entra al FINAL de la cola (idempotente).
  if (!driver.base_id) {
    return "Todavía no tenés una base asignada. Avisale a la central.";
  }
  const entry = await queue.enqueue(driver.base_id, driver.id);
  if (entry.status === "assigned") return "Ya tenés un viaje asignado en este momento.";

  const waiting = await queue.waitingForBase(driver.base_id);
  const pos = waiting.findIndex((w) => w.id === entry.id) + 1 || entry.position;
  const base = await new TaxiBasesRepo(db).get(driver.base_id);
  return `¡Anotado en ${base?.name ?? "la base"}! Estás en la cola, posición ${pos}. Te aviso cuando salga tu viaje.`;
}

async function statusReply(db: Db, driver: TaxiDriver): Promise<string> {
  const queue = new TaxiQueueRepo(db);
  const entry = await queue.activeEntryForDriver(driver.id);
  if (!entry) return "No estás en la cola. Escribime cuando llegues a la base.";
  if (entry.status === "assigned") return "Tenés un viaje asignado ahora mismo.";
  const waiting = await queue.waitingForBase(entry.base_id);
  const pos = waiting.findIndex((w) => w.id === entry.id) + 1 || entry.position;
  const base = await new TaxiBasesRepo(db).get(entry.base_id);
  return `Estás en la cola de ${base?.name ?? "tu base"}, posición ${pos}.`;
}
