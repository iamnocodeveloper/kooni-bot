import { Db } from "./client";

// Motor de despacho del nicho TAXIS. Tablas: taxi_bases / taxi_drivers /
// taxi_queue / taxi_trips / taxi_trip_events (ver schema.sql). Solo se usan
// cuando BOT_NICHE=taxis.

/** Solo dígitos. Se usa para matchear el remitente del webhook con un conductor. */
export function normalizePhone(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** ¿Dos teléfonos son el mismo? Compara por sufijo (tolera prefijo de país). */
export function samePhone(a: string, b: string): boolean {
  const x = normalizePhone(a);
  const y = normalizePhone(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const n = Math.min(10, Math.min(x.length, y.length));
  return n >= 7 && x.slice(-n) === y.slice(-n);
}

// ── Estados del viaje ─────────────────────────────────────────────────────────

export type TaxiTripStatus =
  | "solicitado"
  | "asignado"
  | "en_camino"
  | "completado"
  | "cancelado"
  | "sin_conductor";

export const TAXI_TRIP_FLOW: TaxiTripStatus[] = ["solicitado", "asignado", "en_camino", "completado"];

export const TAXI_TRIP_LABEL: Record<TaxiTripStatus, string> = {
  solicitado: "Solicitado",
  asignado: "Asignado",
  en_camino: "En camino",
  completado: "Completado",
  cancelado: "Cancelado",
  sin_conductor: "Sin conductor",
};

/**
 * ¿Se puede pasar de `from` a `to`?
 * `completado` y `cancelado` son terminales. Desde `solicitado` se puede asignar
 * (con conductor) o marcar `sin_conductor` (y luego asignar a mano).
 */
export function canTransitionTrip(from: TaxiTripStatus, to: TaxiTripStatus): boolean {
  if (from === to) return false;
  if (from === "completado" || from === "cancelado") return false;
  if (to === "cancelado") return true;
  if (to === "sin_conductor") return from === "solicitado";
  if (to === "asignado") return from === "solicitado" || from === "sin_conductor";
  if (to === "en_camino") return from === "asignado";
  if (to === "completado") return from === "asignado" || from === "en_camino";
  return false;
}

// ── Bases ─────────────────────────────────────────────────────────────────────

export interface TaxiZone {
  name: string;
  fee: number;
}

export interface TaxiBase {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  zones: string | null;
  base_fare: number;
  eta_min: number;
  is_default: number;
  active: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface TaxiBaseInput {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  zones?: TaxiZone[];
  baseFare?: number;
  etaMin?: number;
  isDefault?: boolean;
  active?: boolean;
  sortOrder?: number;
}

/** Zonas de una base como array (parsea el JSON; robusto a datos basura). */
export function parseZones(base: Pick<TaxiBase, "zones">): TaxiZone[] {
  try {
    const raw = base.zones ? JSON.parse(base.zones) : [];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((z: any) => ({ name: String(z?.name ?? "").trim(), fee: Number(z?.fee ?? 0) }))
      .filter((z) => z.name);
  } catch {
    return [];
  }
}

export class TaxiBasesRepo {
  constructor(private readonly db: Db) {}

  async create(input: TaxiBaseInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO taxi_bases
        (id, name, address, lat, lng, zones, base_fare, eta_min, is_default, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.address ?? null,
        input.lat ?? null,
        input.lng ?? null,
        JSON.stringify(input.zones ?? []),
        input.baseFare ?? 0,
        input.etaMin ?? 10,
        input.isDefault ? 1 : 0,
        input.active === false ? 0 : 1,
        input.sortOrder ?? 0,
        now,
        now,
      ],
    );
    return id;
  }

  async update(id: string, input: Partial<TaxiBaseInput>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      sets.push(`${col} = ?`);
      params.push(val);
    };
    if (input.name !== undefined) push("name", input.name);
    if (input.address !== undefined) push("address", input.address ?? null);
    if (input.lat !== undefined) push("lat", input.lat ?? null);
    if (input.lng !== undefined) push("lng", input.lng ?? null);
    if (input.zones !== undefined) push("zones", JSON.stringify(input.zones));
    if (input.baseFare !== undefined) push("base_fare", input.baseFare);
    if (input.etaMin !== undefined) push("eta_min", input.etaMin);
    if (input.isDefault !== undefined) push("is_default", input.isDefault ? 1 : 0);
    if (input.active !== undefined) push("active", input.active ? 1 : 0);
    if (input.sortOrder !== undefined) push("sort_order", input.sortOrder);
    if (!sets.length) return;
    push("updated_at", Date.now());
    params.push(id);
    await this.db.run(`UPDATE taxi_bases SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async delete(id: string): Promise<void> {
    await this.db.run("DELETE FROM taxi_bases WHERE id = ?", [id]);
  }

  async get(id: string): Promise<TaxiBase | null> {
    return this.db.first<TaxiBase>("SELECT * FROM taxi_bases WHERE id = ?", [id]);
  }

  async all(): Promise<TaxiBase[]> {
    return this.db.all<TaxiBase>(
      "SELECT * FROM taxi_bases ORDER BY sort_order ASC, name ASC",
    );
  }

  async active(): Promise<TaxiBase[]> {
    return this.db.all<TaxiBase>(
      "SELECT * FROM taxi_bases WHERE active = 1 ORDER BY sort_order ASC, name ASC",
    );
  }
}

// ── Conductores ───────────────────────────────────────────────────────────────

export interface TaxiDriver {
  id: string;
  code: string | null;
  name: string | null;
  phone: string | null;
  phone_norm: string | null;
  base_id: string | null;
  vehicle: string | null;
  plate: string | null;
  seats: number | null;
  active: number;
  created_at: number;
  updated_at: number;
}

export interface TaxiDriverInput {
  code?: string | null;
  name?: string | null;
  phone?: string | null;
  baseId?: string | null;
  vehicle?: string | null;
  plate?: string | null;
  seats?: number | null;
  active?: boolean;
}

export class TaxiDriversRepo {
  constructor(private readonly db: Db) {}

  async create(input: TaxiDriverInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const phone = (input.phone ?? "").trim() || null;
    await this.db.run(
      `INSERT INTO taxi_drivers
        (id, code, name, phone, phone_norm, base_id, vehicle, plate, seats, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.code ?? null,
        input.name ?? null,
        phone,
        phone ? normalizePhone(phone) : null,
        input.baseId ?? null,
        input.vehicle ?? null,
        input.plate ?? null,
        input.seats ?? null,
        input.active === false ? 0 : 1,
        now,
        now,
      ],
    );
    return id;
  }

  async update(id: string, input: Partial<TaxiDriverInput>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      sets.push(`${col} = ?`);
      params.push(val);
    };
    if (input.code !== undefined) push("code", input.code ?? null);
    if (input.name !== undefined) push("name", input.name ?? null);
    if (input.phone !== undefined) {
      const phone = (input.phone ?? "").trim() || null;
      push("phone", phone);
      push("phone_norm", phone ? normalizePhone(phone) : null);
    }
    if (input.baseId !== undefined) push("base_id", input.baseId ?? null);
    if (input.vehicle !== undefined) push("vehicle", input.vehicle ?? null);
    if (input.plate !== undefined) push("plate", input.plate ?? null);
    if (input.seats !== undefined) push("seats", input.seats ?? null);
    if (input.active !== undefined) push("active", input.active ? 1 : 0);
    if (!sets.length) return;
    push("updated_at", Date.now());
    params.push(id);
    await this.db.run(`UPDATE taxi_drivers SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.db.run("UPDATE taxi_drivers SET active = ?, updated_at = ? WHERE id = ?", [
      active ? 1 : 0,
      Date.now(),
      id,
    ]);
  }

  async delete(id: string): Promise<void> {
    await this.db.run("DELETE FROM taxi_drivers WHERE id = ?", [id]);
  }

  async get(id: string): Promise<TaxiDriver | null> {
    return this.db.first<TaxiDriver>("SELECT * FROM taxi_drivers WHERE id = ?", [id]);
  }

  async list(): Promise<TaxiDriver[]> {
    return this.db.all<TaxiDriver>(
      "SELECT * FROM taxi_drivers ORDER BY active DESC, name ASC, code ASC",
    );
  }

  async activeByBase(baseId: string): Promise<TaxiDriver[]> {
    return this.db.all<TaxiDriver>(
      "SELECT * FROM taxi_drivers WHERE base_id = ? AND active = 1 ORDER BY name ASC",
      [baseId],
    );
  }

  /** Busca un conductor activo por su teléfono (normalizado). Null si no hay. */
  async byPhone(rawPhone: string): Promise<TaxiDriver | null> {
    const norm = normalizePhone(rawPhone);
    if (norm.length < 7) return null;
    const rows = await this.db.all<TaxiDriver>(
      "SELECT * FROM taxi_drivers WHERE active = 1 AND phone_norm IS NOT NULL",
    );
    return rows.find((d) => samePhone(d.phone_norm ?? "", norm)) ?? null;
  }
}

// ── Cola (FIFO por base) ──────────────────────────────────────────────────────

export type TaxiQueueStatus = "waiting" | "assigned" | "done" | "left";

export interface TaxiQueueEntry {
  id: string;
  base_id: string;
  driver_id: string;
  position: number;
  status: TaxiQueueStatus;
  arrived_at: number;
  assigned_at: number | null;
  trip_id: string | null;
  updated_at: number;
}

export class TaxiQueueRepo {
  constructor(private readonly db: Db) {}

  /**
   * El conductor llega a su base y entra al FINAL de la fila. Idempotente: si ya
   * está esperando, devuelve su entrada; si tiene un viaje asignado, esa.
   */
  async enqueue(baseId: string, driverId: string): Promise<TaxiQueueEntry> {
    const current = await this.activeEntryForDriver(driverId);
    if (current) return current;
    const id = crypto.randomUUID();
    const now = Date.now();
    const next =
      (await this.db.first<{ n: number | null }>(
        "SELECT MAX(position) as n FROM taxi_queue WHERE base_id = ? AND status = 'waiting'",
        [baseId],
      ))?.n ?? 0;
    await this.db.run(
      `INSERT INTO taxi_queue (id, base_id, driver_id, position, status, arrived_at, updated_at)
       VALUES (?, ?, ?, ?, 'waiting', ?, ?)`,
      [id, baseId, driverId, (next ?? 0) + 1, now, now],
    );
    return { id, base_id: baseId, driver_id: driverId, position: (next ?? 0) + 1, status: "waiting", arrived_at: now, assigned_at: null, trip_id: null, updated_at: now };
  }

  /** Entrada activa (esperando o con viaje asignado) de un conductor. */
  async activeEntryForDriver(driverId: string): Promise<TaxiQueueEntry | null> {
    return this.db.first<TaxiQueueEntry>(
      "SELECT * FROM taxi_queue WHERE driver_id = ? AND status IN ('waiting','assigned') ORDER BY arrived_at DESC LIMIT 1",
      [driverId],
    );
  }

  async waitingForBase(baseId: string): Promise<TaxiQueueEntry[]> {
    return this.db.all<TaxiQueueEntry>(
      "SELECT * FROM taxi_queue WHERE base_id = ? AND status = 'waiting' ORDER BY position ASC, arrived_at ASC",
      [baseId],
    );
  }

  /** El siguiente de la fila (menor posición) de la base. */
  async nextForBase(baseId: string): Promise<TaxiQueueEntry | null> {
    return this.db.first<TaxiQueueEntry>(
      "SELECT * FROM taxi_queue WHERE base_id = ? AND status = 'waiting' ORDER BY position ASC, arrived_at ASC LIMIT 1",
      [baseId],
    );
  }

  async get(id: string): Promise<TaxiQueueEntry | null> {
    return this.db.first<TaxiQueueEntry>("SELECT * FROM taxi_queue WHERE id = ?", [id]);
  }

  /** Saca al conductor esperando de la fila (voluntariamente). */
  async leave(driverId: string): Promise<void> {
    const entry = await this.activeEntryForDriver(driverId);
    if (!entry) return;
    await this.db.run("UPDATE taxi_queue SET status = 'left', updated_at = ? WHERE id = ?", [
      Date.now(),
      entry.id,
    ]);
    await this.compact(entry.base_id);
  }

  /** Marca la entrada como 'done' (viaje terminado). */
  async finish(entryId: string): Promise<void> {
    const entry = await this.get(entryId);
    if (!entry) return;
    await this.db.run("UPDATE taxi_queue SET status = 'done', updated_at = ? WHERE id = ?", [
      Date.now(),
      entryId,
    ]);
    await this.compact(entry.base_id);
  }

  /** Marca una entrada como asignada a un viaje. */
  async assign(entryId: string, tripId: string): Promise<void> {
    const entry = await this.get(entryId);
    if (!entry) return;
    await this.db.run(
      "UPDATE taxi_queue SET status = 'assigned', trip_id = ?, assigned_at = ?, updated_at = ? WHERE id = ?",
      [tripId, Date.now(), Date.now(), entryId],
    );
    await this.compact(entry.base_id);
  }

  /** Sube una posición al conductor (intercambia con el anterior de la fila). */
  async moveUp(entryId: string): Promise<void> {
    const e = await this.get(entryId);
    if (!e || e.status !== "waiting") return;
    const prev = await this.db.first<TaxiQueueEntry>(
      "SELECT * FROM taxi_queue WHERE base_id = ? AND status = 'waiting' AND position < ? ORDER BY position DESC LIMIT 1",
      [e.base_id, e.position],
    );
    if (!prev) return;
    await this.db.run("UPDATE taxi_queue SET position = ? WHERE id = ?", [prev.position, e.id]);
    await this.db.run("UPDATE taxi_queue SET position = ? WHERE id = ?", [e.position, prev.id]);
  }

  /** Recompacta las posiciones de los esperando (1..n) tras una salida/asignación. */
  async compact(baseId: string): Promise<void> {
    const waiting = await this.waitingForBase(baseId);
    let pos = 1;
    for (const w of waiting) {
      if (w.position !== pos) {
        await this.db.run("UPDATE taxi_queue SET position = ? WHERE id = ?", [pos, w.id]);
      }
      pos++;
    }
  }

  /** Cuántos conductores esperando hay por base (para la pantalla Cola). */
  async waitingCounts(): Promise<Record<string, number>> {
    const rows = await this.db.all<{ base_id: string; n: number }>(
      "SELECT base_id, COUNT(*) as n FROM taxi_queue WHERE status = 'waiting' GROUP BY base_id",
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[r.base_id] = r.n;
    return out;
  }

  async recent(limit = 100): Promise<TaxiQueueEntry[]> {
    return this.db.all<TaxiQueueEntry>(
      "SELECT * FROM taxi_queue ORDER BY arrived_at DESC LIMIT ?",
      [limit],
    );
  }

  /** Entradas esperando más viejas que `cutoff` (para expirar en el cron). */
  async staleWaiting(cutoff: number): Promise<TaxiQueueEntry[]> {
    return this.db.all<TaxiQueueEntry>(
      "SELECT * FROM taxi_queue WHERE status = 'waiting' AND arrived_at < ?",
      [cutoff],
    );
  }
}

// ── Viajes ────────────────────────────────────────────────────────────────────

export interface TaxiTrip {
  id: string;
  conversation_id: string | null;
  channel: string | null;
  channel_user_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dest_address: string | null;
  zone: string | null;
  base_id: string | null;
  driver_id: string | null;
  status: TaxiTripStatus;
  fare_estimate: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface TaxiTripEvent {
  id: string;
  trip_id: string;
  status: string;
  note: string | null;
  at: number;
}

export interface CreateTaxiTripInput {
  conversationId?: string | null;
  channel?: string | null;
  channelUserId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  pickupAddress?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  destAddress?: string | null;
  zone?: string | null;
  baseId?: string | null;
  driverId?: string | null;
  status?: TaxiTripStatus;
  fareEstimate?: number | null;
  notes?: string | null;
}

export class TaxiTripsRepo {
  constructor(private readonly db: Db) {}

  async create(input: CreateTaxiTripInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO taxi_trips
        (id, conversation_id, channel, channel_user_id, customer_name, customer_phone,
         pickup_address, pickup_lat, pickup_lng, dest_address, zone, base_id, driver_id,
         status, fare_estimate, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.conversationId ?? null,
        input.channel ?? null,
        input.channelUserId ?? null,
        input.customerName ?? null,
        input.customerPhone ?? null,
        input.pickupAddress ?? null,
        input.pickupLat ?? null,
        input.pickupLng ?? null,
        input.destAddress ?? null,
        input.zone ?? null,
        input.baseId ?? null,
        input.driverId ?? null,
        input.status ?? "solicitado",
        input.fareEstimate ?? null,
        input.notes ?? null,
        now,
        now,
      ],
    );
    await this.addEvent(id, input.status ?? "solicitado", "viaje creado");
    return id;
  }

  async get(id: string): Promise<TaxiTrip | null> {
    return this.db.first<TaxiTrip>("SELECT * FROM taxi_trips WHERE id = ?", [id]);
  }

  /** El viaje vivo (no terminado) de una conversación, si lo hay. */
  async activeForConversation(conversationId: string): Promise<TaxiTrip | null> {
    return this.db.first<TaxiTrip>(
      "SELECT * FROM taxi_trips WHERE conversation_id = ? AND status NOT IN ('completado','cancelado') ORDER BY created_at DESC LIMIT 1",
      [conversationId],
    );
  }

  async list(opts: { status?: TaxiTripStatus; limit?: number; since?: number } = {}): Promise<TaxiTrip[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status) { where.push("status = ?"); params.push(opts.status); }
    if (opts.since) { where.push("created_at >= ?"); params.push(opts.since); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(opts.limit ?? 100);
    return this.db.all<TaxiTrip>(`SELECT * FROM taxi_trips ${clause} ORDER BY created_at DESC LIMIT ?`, params);
  }

  /** Los viajes "vivos" del panel (ni completados ni cancelados). */
  async active(): Promise<TaxiTrip[]> {
    return this.db.all<TaxiTrip>(
      "SELECT * FROM taxi_trips WHERE status NOT IN ('completado','cancelado') ORDER BY created_at ASC",
    );
  }

  /** Cambia el estado si la transición es válida. Null si no aplica. */
  async setStatus(id: string, to: TaxiTripStatus, note?: string): Promise<TaxiTrip | null> {
    const trip = await this.get(id);
    if (!trip) return null;
    if (!canTransitionTrip(trip.status, to)) return null;
    const now = Date.now();
    await this.db.run("UPDATE taxi_trips SET status = ?, updated_at = ? WHERE id = ?", [to, now, id]);
    await this.addEvent(id, to, note ?? null);
    return { ...trip, status: to, updated_at: now };
  }

  /** Asigna un conductor (y su base) al viaje y lo pasa a `asignado`. */
  async assignDriver(id: string, driverId: string, baseId: string | null, note?: string): Promise<TaxiTrip | null> {
    const trip = await this.get(id);
    if (!trip) return null;
    if (!canTransitionTrip(trip.status, "asignado")) return null;
    const now = Date.now();
    await this.db.run(
      "UPDATE taxi_trips SET driver_id = ?, base_id = ?, status = 'asignado', updated_at = ? WHERE id = ?",
      [driverId, baseId, now, id],
    );
    await this.addEvent(id, "asignado", note ?? "conductor asignado");
    return { ...trip, driver_id: driverId, base_id: baseId, status: "asignado", updated_at: now };
  }

  async events(tripId: string): Promise<TaxiTripEvent[]> {
    return this.db.all<TaxiTripEvent>(
      "SELECT * FROM taxi_trip_events WHERE trip_id = ? ORDER BY at ASC",
      [tripId],
    );
  }

  async addEvent(tripId: string, status: string, note: string | null): Promise<void> {
    await this.db.run(
      "INSERT INTO taxi_trip_events (id, trip_id, status, note, at) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), tripId, status, note, Date.now()],
    );
  }

  /** Viajes vivos más viejos que `cutoff` (para cerrar en el cron). */
  async staleActive(cutoff: number): Promise<TaxiTrip[]> {
    return this.db.all<TaxiTrip>(
      "SELECT * FROM taxi_trips WHERE status NOT IN ('completado','cancelado') AND created_at < ?",
      [cutoff],
    );
  }
}
