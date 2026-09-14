import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { TaxiBasesRepo, TaxiDriversRepo, TaxiTripsRepo } from "../../src/db/taxi";
import { buildTaxiReports, reportsToCsv } from "../../src/reports/taxis";

let env: any;
let db: Db;
const DAY = 86_400_000;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  db = new Db(d1 as any);
  env = { DB: d1, DASHBOARD_BASE_URL: "https://bot.example" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

describe("buildTaxiReports", () => {
  it("cuenta viajes, completados y sin conductor del período", async () => {
    const trips = new TaxiTripsRepo(db);
    const baseId = await new TaxiBasesRepo(db).create({ name: "Centro" });
    const driverId = await new TaxiDriversRepo(db).create({ name: "Juan", baseId });

    const a = await trips.create({ status: "asignado", baseId, driverId, zone: "Centro", fareEstimate: 30, pickupAddress: "x" });
    await trips.setStatus(a, "completado");
    const b = await trips.create({ status: "sin_conductor", pickupAddress: "y" });
    await trips.create({ status: "cancelado", pickupAddress: "z" });

    const now = Date.now();
    const r = await buildTaxiReports(env, { from: now - DAY, to: now + DAY });
    expect(r.viajes.total).toBe(2); // no cancelado
    expect(r.viajes.completados).toBe(1);
    expect(r.viajes.sinConductor).toBe(1);
    expect(r.tarifas.total).toBe(30);
    expect(r.bases.rows[0].name).toBe("Centro");
    expect(r.conductores.rows[0].name).toBe("Juan");
    expect(r.zonas.rows.some((z) => z.zone === "Centro")).toBe(true);
    expect(typeof r.viajes.action).toBe("string");
    expect(r.viajes.action.length).toBeGreaterThan(5);
  });

  it("el CSV incluye las secciones esperadas", async () => {
    const now = Date.now();
    const r = await buildTaxiReports(env, { from: now - DAY, to: now + DAY });
    const csv = reportsToCsv(r);
    expect(csv).toContain("REPORTE,metr");
    expect(csv).toContain("Viajes");
    expect(csv).toContain("Salud del bot");
  });
});
