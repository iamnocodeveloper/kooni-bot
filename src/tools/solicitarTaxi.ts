import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import type { ChannelId } from "../channels/shared";
import { Db } from "../db/client";
import {
  TaxiBasesRepo,
  TaxiDriversRepo,
  TaxiQueueRepo,
  TaxiTripsRepo,
  normalizePhone,
} from "../db/taxi";
import type { TaxiTrip } from "../db/taxi";
import { estimateFare, pickBase, validCoords } from "../taxi/dispatch";
import { driverLabel, markUrgent, notifyDriverAssigned, notifyOwnerNewTrip } from "../taxi/notify";
import type { RecursoCtx } from "./enviarRecurso";

// Nicho TAXIS: registra la solicitud de un taxi. Elige la base más cercana CON
// conductores en cola (por GPS del pin o por la zona que dijo el cliente),
// asigna al SIGUIENTE de la fila y avisa al conductor + al dueño. Si no hay
// conductores, deja el viaje como "sin_conductor" y marca el chat como urgente
// para que el operador asigne a mano.
//
// El mensaje al CLIENTE lo escribe el modelo con los datos que devuelve la tool
// (no la tool directamente) para que la conversación suene natural.

export function solicitarTaxiTool(
  env: Env,
  getConversationId: () => string | null,
  getChannelCtx: () => RecursoCtx | null,
  getLocation: () => { lat: number; lng: number; name?: string; address?: string } | null,
) {
  return tool({
    description:
      "Registra una SOLICITUD de taxi ya con la ubicación del cliente (pin compartido o zona escrita) y le asigna el conductor que sigue en la fila de la base más cercana. Usala cuando ya tengas la ubicación. Devuelve el conductor asignado (o 'sin_conductor' si no hay ninguno).",
    inputSchema: z.object({
      pickup: z.string().describe("dónde está el cliente: dirección, referencia o 'ubicación compartida'"),
      zone: z.string().optional().describe("zona/barrio que dijo el cliente, si lo dijo"),
      dest: z.string().optional().describe("destino del viaje, si el cliente lo dijo"),
      name: z.string().optional().describe("nombre del cliente, si lo dijo"),
      pickupLat: z.number().optional().describe("latitud si el cliente compartió el pin"),
      pickupLng: z.number().optional().describe("longitud si el cliente compartió el pin"),
      notes: z.string().max(240).optional().describe("nota corta (equipaje, silla de bebé, referencia)"),
    }),
    execute: async ({ pickup, zone, dest, name, pickupLat, pickupLng, notes }) => {
      const db = new Db(env.DB);
      const convId = getConversationId();
      const ctx = getChannelCtx();
      const loc = getLocation();
      const trips = new TaxiTripsRepo(db);

      // Un cliente no debería tener dos viajes vivos a la vez.
      if (convId) {
        const existing = await trips.activeForConversation(convId);
        if (existing && existing.status !== "sin_conductor") {
          return {
            ok: true,
            yaExistia: true,
            estado: existing.status,
            mensaje: "Este cliente YA tiene un viaje en curso; no crees otro.",
          };
        }
      }

      const lat = pickupLat ?? loc?.lat;
      const lng = pickupLng ?? loc?.lng;
      const coords = validCoords({ lat: lat ?? NaN, lng: lng ?? NaN }) ? { lat: lat as number, lng: lng as number } : null;

      const bases = await new TaxiBasesRepo(db).active();
      const queue = new TaxiQueueRepo(db);
      const waitingByBase = await queue.waitingCounts();
      const pick = pickBase({ bases, waitingByBase, location: coords, zoneText: zone ?? pickup });
      const fare = pick.base ? estimateFare(pick.base, pick.zone) : null;

      const tripId = await trips.create({
        conversationId: convId,
        channel: ctx?.channel ?? null,
        channelUserId: ctx?.channelUserId ?? null,
        customerName: name ?? null,
        customerPhone: guessPhone(ctx?.channelUserId),
        pickupAddress: pickup,
        pickupLat: lat ?? null,
        pickupLng: lng ?? null,
        destAddress: dest ?? null,
        zone: (zone ?? pick.zone?.name ?? null) || null,
        baseId: pick.base?.id ?? null,
        status: "solicitado",
        fareEstimate: fare,
        notes: notes ?? null,
      });

      // Sin base con conductores → urgente para el operador.
      const entry = pick.base ? await queue.nextForBase(pick.base.id) : null;
      if (!pick.base || !entry) {
        await trips.setStatus(tripId, "sin_conductor");
        const trip = await trips.get(tripId);
        await markUrgent(env, convId, trip!, "sin conductor disponible");
        await writeLeadMeta(db, convId, { base: pick.base?.name ?? "", zona: zone ?? pick.zone?.name ?? "", conductor: "", destino: dest ?? "" });
        return {
          ok: true,
          estado: "sin_conductor",
          tarifaEstimada: fare,
          instruccion:
            "NO hay conductores disponibles ahora. Decile al cliente que avisaste a la central y que le confirmás apenas se libere uno. El chat quedó marcado como urgente.",
        };
      }

      const driver = await new TaxiDriversRepo(db).get(entry.driver_id);
      if (!driver) {
        await trips.setStatus(tripId, "sin_conductor");
        const trip = await trips.get(tripId);
        await markUrgent(env, convId, trip!, "conductor no encontrado");
        return { ok: true, estado: "sin_conductor", instruccion: "No se pudo asignar el conductor. La central lo verá." };
      }

      await queue.assign(entry.id, tripId);
      const trip = await trips.assignDriver(tripId, driver.id, pick.base.id, "asignación automática");

      // Avisos: al conductor (por su WhatsApp) y al dueño (push). El mensaje al
      // CLIENTE lo redacta el modelo con estos datos.
      await notifyDriverAssigned(env, trip!, driver, pick.base);
      await notifyOwnerNewTrip(env, trip!, driver, pick.base);
      await writeLeadMeta(db, convId, {
        base: pick.base.name,
        zona: zone ?? pick.zone?.name ?? "",
        conductor: driver.name ?? driver.code ?? "",
        destino: dest ?? "",
      });

      return {
        ok: true,
        estado: "asignado",
        base: pick.base.name,
        baseElegidaPor: pick.reason,
        conductor: {
          nombre: driver.name,
          codigo: driver.code,
          vehiculo: driver.vehicle,
          placa: driver.plate,
          telefono: driver.phone,
        },
        etaMin: pick.base.eta_min,
        tarifaEstimada: fare,
        instruccion:
          `Ya salió ${driverLabel(driver)} desde ${pick.base.name}` +
          `${pick.base.eta_min ? `, llega en ~${pick.base.eta_min} min` : ""}.` +
          (fare != null ? ` Tarifa estimada: ${fare}.` : "") +
          " Decíselo al cliente con esos datos. No inventes otros.",
      };
    },
  });
}

/** Teléfono del cliente si el id del canal es un número (WhatsApp/WAHA). */
function guessPhone(channelUserId: string | undefined | null): string | null {
  const digits = normalizePhone(channelUserId);
  return digits.length >= 7 ? digits : null;
}

/** Deja base/zona/conductor/destino visibles como columnas del kanban (leads). */
async function writeLeadMeta(
  db: Db,
  conversationId: string | null,
  meta: Record<string, string>,
): Promise<void> {
  if (!conversationId) return;
  try {
    const { LeadsRepo } = await import("../db/leads");
    const leads = new LeadsRepo(db);
    const lead = await leads.ensureEntrada(conversationId);
    if (lead.status === "entrada") await leads.setStatus(lead.id, "new");
    await db.run("UPDATE leads SET metadata = ?, updated_at = ? WHERE id = ?", [
      JSON.stringify(meta),
      Date.now(),
      lead.id,
    ]);
  } catch (e) {
    console.warn("[solicitarTaxi] no se pudo escribir la ficha:", e);
  }
}
