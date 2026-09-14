import type { Env } from "../env";
import { Db } from "../db/client";
import { TaxiQueueRepo, TaxiTripsRepo } from "../db/taxi";

// Mantenimiento del nicho TAXIS (tick del cron). Best-effort: no debe tumbar el
// resto del cron si falla. Dos limpiezas:
//  1. Conductores en cola hace demasiado → se asumen idos (liberan el puesto).
//  2. Viajes vivos hace demasiado → se cancelan para que no ensucien el panel.

const STALE_QUEUE_MS = 8 * 60 * 60 * 1000; // 8 h esperando en la base
const STALE_TRIP_MS = 6 * 60 * 60 * 1000; // 6 h con un viaje sin cerrar

export async function runTaxiMaintenance(env: Env): Promise<{ staleQueue: number; staleTrips: number }> {
  const db = new Db(env.DB);
  const queue = new TaxiQueueRepo(db);
  const trips = new TaxiTripsRepo(db);
  let staleQueue = 0;
  let staleTrips = 0;

  for (const e of await queue.staleWaiting(Date.now() - STALE_QUEUE_MS)) {
    await queue.leave(e.driver_id);
    staleQueue++;
  }

  for (const t of await trips.staleActive(Date.now() - STALE_TRIP_MS)) {
    const r = await trips.setStatus(t.id, "cancelado", "cerrado automáticamente por inactividad");
    if (r) staleTrips++;
  }

  return { staleQueue, staleTrips };
}
