import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { TaxiBasesRepo, TaxiDriversRepo, TaxiQueueRepo, TaxiTripsRepo } from "../../src/db/taxi";
import { solicitarTaxiTool } from "../../src/tools/solicitarTaxi";

let env: any;
let db: Db;

const ctx = { channel: "waha" as const, channelUserId: "584120000000@c.us" };

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  db = new Db(d1 as any);
  env = { DB: d1, DASHBOARD_BASE_URL: "https://bot.example" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

function run(loc: { lat: number; lng: number } | null, input: any) {
  return solicitarTaxiTool(env, () => "waha:584120000000", () => ctx, () => loc).execute!(input, {} as any) as Promise<any>;
}

async function seed() {
  const baseId = await new TaxiBasesRepo(db).create({ name: "Centro", zones: [{ name: "Centro", fee: 30 }], baseFare: 20, etaMin: 8 });
  const drivers = new TaxiDriversRepo(db);
  const queue = new TaxiQueueRepo(db);
  const d1 = await drivers.create({ code: "342", name: "Juan", phone: "584111111111", baseId, vehicle: "Aveo", plate: "AB123CD" });
  await queue.enqueue(baseId, d1);
  return { baseId, d1 };
}

describe("solicitarTaxiTool", () => {
  it("asigna al primer conductor de la fila y devuelve sus datos", async () => {
    const { d1 } = await seed();
    const r = await run(null, { pickup: "Av. Siempre Viva 742", zone: "Centro", name: "Leo" });
    expect(r.ok).toBe(true);
    expect(r.estado).toBe("asignado");
    expect(r.conductor.codigo).toBe("342");
    expect(r.base).toBe("Centro");
    expect(r.tarifaEstimada).toBe(50); // base_fare 20 + zona 30
    expect(r.etaMin).toBe(8);

    const trips = new TaxiTripsRepo(db);
    const active = await trips.active();
    expect(active.length).toBe(1);
    expect(active[0].driver_id).toBe(d1);
    expect(active[0].status).toBe("asignado");
    expect(active[0].base_id).toBe(r.base ? active[0].base_id : null);
  });

  it("sin conductores deja el viaje 'sin_conductor' y marca urgente", async () => {
    await new TaxiBasesRepo(db).create({ name: "Centro", zones: [{ name: "Centro", fee: 30 }] });
    const r = await run({ lat: 10, lng: -66 }, { pickup: "ubicación compartida" });
    expect(r.ok).toBe(true);
    expect(r.estado).toBe("sin_conductor");
    expect(r.instruccion).toMatch(/urgente|central/i);

    const trips = new TaxiTripsRepo(db);
    expect((await trips.active())[0].status).toBe("sin_conductor");
  });

  it("no crea un segundo viaje si el cliente ya tiene uno vivo", async () => {
    await seed();
    await run(null, { pickup: "Av. 1", zone: "Centro" });
    const r2 = await run(null, { pickup: "Av. 1", zone: "Centro" });
    expect(r2.yaExistia).toBe(true);
    expect((await new TaxiTripsRepo(db).active()).length).toBe(1);
  });

  it("usa el GPS del pin para elegir la base más cercana con cola", async () => {
    const bases = new TaxiBasesRepo(db);
    const lejos = await bases.create({ name: "Lejos", lat: 10.9, lng: -66 });
    const cerca = await bases.create({ name: "Cerca", lat: 10.0, lng: -66 });
    const drivers = new TaxiDriversRepo(db);
    const queue = new TaxiQueueRepo(db);
    await queue.enqueue(lejos, await drivers.create({ name: "L", baseId: lejos }));
    await queue.enqueue(cerca, await drivers.create({ name: "C", baseId: cerca }));

    const r = await run({ lat: 10.01, lng: -66 }, { pickup: "ubicación compartida" });
    expect(r.base).toBe("Cerca");
  });
});
