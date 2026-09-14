import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import {
  TaxiBasesRepo,
  TaxiDriversRepo,
  TaxiQueueRepo,
  TaxiTripsRepo,
  canTransitionTrip,
  normalizePhone,
  samePhone,
  parseZones,
} from "../../src/db/taxi";

let db: Db;
let bases: TaxiBasesRepo;
let drivers: TaxiDriversRepo;
let queue: TaxiQueueRepo;
let trips: TaxiTripsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  db = new Db(d1 as any);
  bases = new TaxiBasesRepo(db);
  drivers = new TaxiDriversRepo(db);
  queue = new TaxiQueueRepo(db);
  trips = new TaxiTripsRepo(db);
});

describe("normalizePhone / samePhone", () => {
  it("deja solo dígitos", () => {
    expect(normalizePhone("+58 412-345 6789")).toBe("584123456789");
    expect(normalizePhone(null)).toBe("");
  });

  it("compara por sufijo (tolera prefijo de país)", () => {
    expect(samePhone("+58 4123456789", "4123456789")).toBe(true);
    expect(samePhone("584123456789", "581234567890")).toBe(false);
  });
});

describe("TaxiBasesRepo", () => {
  it("crea, lee, actualiza y lista bases activas", async () => {
    const id = await bases.create({ name: "Centro", lat: 10, lng: -66, zones: [{ name: "Centro", fee: 15 }], baseFare: 10 });
    const b = await bases.get(id);
    expect(b?.name).toBe("Centro");
    expect(parseZones(b!)).toEqual([{ name: "Centro", fee: 15 }]);

    await bases.update(id, { name: "Centro Histórico", isDefault: true });
    const b2 = await bases.get(id);
    expect(b2?.name).toBe("Centro Histórico");
    expect(b2?.is_default).toBe(1);
    expect((await bases.active()).length).toBe(1);
  });
});

describe("TaxiDriversRepo", () => {
  it("guarda phone_norm y encuentra al conductor por teléfono", async () => {
    const baseId = await bases.create({ name: "Centro" });
    await drivers.create({ code: "342", name: "Juan", phone: "+58 412-3456789", baseId, vehicle: "Aveo", plate: "AB123CD" });
    const found = await drivers.byPhone("584123456789");
    expect(found?.code).toBe("342");
    expect(found?.base_id).toBe(baseId);
    // Con otro prefijo de país también matchea por sufijo.
    expect((await drivers.byPhone("4123456789"))?.name).toBe("Juan");
    expect(await drivers.byPhone("99999999")).toBeNull();
  });

  it("no encuentra conductores inactivos", async () => {
    await drivers.create({ name: "Pedro", phone: "584000000000" });
    const d = await drivers.byPhone("584000000000");
    await drivers.setActive(d!.id, false);
    expect(await drivers.byPhone("584000000000")).toBeNull();
  });
});

describe("TaxiQueueRepo (FIFO)", () => {
  it("encola al final y asigna al siguiente, recompactando posiciones", async () => {
    const baseId = await bases.create({ name: "Centro" });
    const d1 = await drivers.create({ name: "A", baseId });
    const d2 = await drivers.create({ name: "B", baseId });
    const d3 = await drivers.create({ name: "C", baseId });

    await queue.enqueue(baseId, d1);
    await queue.enqueue(baseId, d2);
    await queue.enqueue(baseId, d3);
    let waiting = await queue.waitingForBase(baseId);
    expect(waiting.map((w) => w.position)).toEqual([1, 2, 3]);
    expect(waiting.map((w) => w.driver_id)).toEqual([d1, d2, d3]);

    const next = await queue.nextForBase(baseId);
    expect(next?.driver_id).toBe(d1);
    await queue.assign(next!.id, "trip-1");

    waiting = await queue.waitingForBase(baseId);
    expect(waiting.map((w) => w.driver_id)).toEqual([d2, d3]);
    expect(waiting.map((w) => w.position)).toEqual([1, 2]);
  });

  it("es idempotente: encolar dos veces al mismo conductor no lo duplica", async () => {
    const baseId = await bases.create({ name: "Centro" });
    const d1 = await drivers.create({ name: "A", baseId });
    const first = await queue.enqueue(baseId, d1);
    const second = await queue.enqueue(baseId, d1);
    expect(second.id).toBe(first.id);
    expect((await queue.waitingForBase(baseId)).length).toBe(1);
  });

  it("leave saca al conductor y recompacta; finish cierra su entrada", async () => {
    const baseId = await bases.create({ name: "Centro" });
    const d1 = await drivers.create({ name: "A", baseId });
    const d2 = await drivers.create({ name: "B", baseId });
    await queue.enqueue(baseId, d1);
    await queue.enqueue(baseId, d2);
    await queue.leave(d1);
    const waiting = await queue.waitingForBase(baseId);
    expect(waiting.map((w) => w.driver_id)).toEqual([d2]);
    expect(waiting[0].position).toBe(1);

    const entry = await queue.activeEntryForDriver(d2);
    await queue.finish(entry!.id);
    expect(await queue.activeEntryForDriver(d2)).toBeNull();
  });

  it("waitingCounts agrupa por base", async () => {
    const b1 = await bases.create({ name: "A" });
    const b2 = await bases.create({ name: "B" });
    const d1 = await drivers.create({ name: "A1", baseId: b1 });
    const d2 = await drivers.create({ name: "B1", baseId: b2 });
    await queue.enqueue(b1, d1);
    await queue.enqueue(b2, d2);
    expect(await queue.waitingCounts()).toEqual({ [b1]: 1, [b2]: 1 });
  });
});

describe("TaxiTripsRepo", () => {
  it("crea un viaje y respeta la máquina de estados", async () => {
    const id = await trips.create({ pickupAddress: "Calle 1", zone: "Centro", status: "solicitado" });
    expect((await trips.get(id))?.status).toBe("solicitado");

    // Transición inválida: no se puede completar sin asignar.
    expect(await trips.setStatus(id, "completado")).toBeNull();

    const b = await bases.create({ name: "Centro" });
    const d = await drivers.create({ name: "A", baseId: b });
    const assigned = await trips.assignDriver(id, d, b);
    expect(assigned?.status).toBe("asignado");

    const done = await trips.setStatus(id, "completado");
    expect(done?.status).toBe("completado");
    // Terminal: nada sale de completado.
    expect(await trips.setStatus(id, "cancelado")).toBeNull();

    const evs = await trips.events(id);
    expect(evs.map((e) => e.status)).toContain("asignado");
    expect(evs.map((e) => e.status)).toContain("completado");
  });

  it("active() devuelve solo los viajes vivos", async () => {
    const a = await trips.create({ status: "solicitado" });
    const b = await trips.create({ status: "sin_conductor" });
    const c = await trips.create({ status: "solicitado" });
    await trips.setStatus(c, "cancelado");
    const active = await trips.active();
    expect(active.map((t) => t.id).sort()).toEqual([a, b].sort());
  });
});

describe("canTransitionTrip", () => {
  it("permite el flujo normal y bloquea los retrocesos/terminales", () => {
    expect(canTransitionTrip("solicitado", "asignado")).toBe(true);
    expect(canTransitionTrip("solicitado", "sin_conductor")).toBe(true);
    expect(canTransitionTrip("sin_conductor", "asignado")).toBe(true);
    expect(canTransitionTrip("asignado", "en_camino")).toBe(true);
    expect(canTransitionTrip("en_camino", "completado")).toBe(true);
    expect(canTransitionTrip("asignado", "cancelado")).toBe(true);
    expect(canTransitionTrip("completado", "cancelado")).toBe(false);
    expect(canTransitionTrip("en_camino", "asignado")).toBe(false);
    expect(canTransitionTrip("solicitado", "completado")).toBe(false);
  });
});
