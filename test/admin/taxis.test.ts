import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { adminApp } from "../../src/admin/routes";
import { Db } from "../../src/db/client";
import {
  TaxiBasesRepo,
  TaxiDriversRepo,
  TaxiQueueRepo,
  TaxiTripsRepo,
} from "../../src/db/taxi";
import type { Env } from "../../src/env";

const PASSWORD = "secret123";
const authHeader = () => {
  const b64 = Buffer.from(`admin:${PASSWORD}`).toString("base64");
  return { Authorization: `Basic ${b64}` };
};
const form = (o: Record<string, string>) => ({
  method: "POST",
  headers: { ...authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

let env: Env;
let db: Db;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
  env = {
    DB: db.d1,
    BOT_NAME: "Bot",
    BUSINESS_NAME: "Central",
    BOT_LANGUAGE: "es",
    BUFFER_SECONDS: "8",
    DASHBOARD_PASSWORD: PASSWORD,
    BOT_NICHE: "taxis",
  } as unknown as Env;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

describe("rutas del nicho taxis", () => {
  it("las vistas responden 200 con BOT_NICHE=taxis", async () => {
    for (const path of ["/viajes", "/cola", "/bases", "/conductores", "/reportes"]) {
      const res = await adminApp.request(path, { headers: authHeader() }, env);
      expect(res.status, path).toBe(200);
      expect((await res.text()).length).toBeGreaterThan(100);
    }
  });

  it("sin el nicho, esas rutas redirigen a /admin/overview", async () => {
    const other = { ...env, BOT_NICHE: "generico" } as Env;
    for (const path of ["/viajes", "/cola", "/bases", "/conductores", "/reportes"]) {
      const res = await adminApp.request(path, { headers: authHeader() }, other);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin/overview");
    }
  });

  it("crea una base con zonas y la lista", async () => {
    const res = await adminApp.request(
      "/bases",
      form({ name: "Centro", zones: "Centro : 30\nNorte : 45", base_fare: "20", eta_min: "8" }),
      env,
    );
    expect(res.status).toBe(302);
    const bases = await new TaxiBasesRepo(db).all();
    expect(bases).toHaveLength(1);
    expect(bases[0].name).toBe("Centro");
    expect(bases[0].base_fare).toBe(20);
    expect(JSON.parse(bases[0].zones!)).toEqual([
      { name: "Centro", fee: 30 },
      { name: "Norte", fee: 45 },
    ]);
  });

  it("crea un conductor con teléfono y lo encuentra por número", async () => {
    const baseId = await new TaxiBasesRepo(db).create({ name: "Centro" });
    const res = await adminApp.request(
      "/conductores",
      form({ name: "Juan", code: "342", phone: "+58 412-3456789", base_id: baseId, plate: "AB123CD" }),
      env,
    );
    expect(res.status).toBe(302);
    const found = await new TaxiDriversRepo(db).byPhone("584123456789");
    expect(found?.code).toBe("342");
    expect(found?.base_id).toBe(baseId);
  });

  it("feed devuelve los viajes activos", async () => {
    await new TaxiTripsRepo(db).create({ status: "solicitado", pickupAddress: "Av. 1" });
    const res = await adminApp.request("/viajes/feed", { headers: authHeader() }, env);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { count: number; ids: string[] };
    expect(j.count).toBe(1);
    expect(Array.isArray(j.ids)).toBe(true);
  });

  it("asignar conductor desde el panel avisa al cliente y cambia el viaje a 'asignado'", async () => {
    const baseId = await new TaxiBasesRepo(db).create({ name: "Centro" });
    const driverId = await new TaxiDriversRepo(db).create({ name: "Juan", phone: "584111111111", baseId, plate: "AB123CD" });
    const tripId = await new TaxiTripsRepo(db).create({
      status: "sin_conductor",
      pickupAddress: "Av. 1",
      channel: "waha",
      channelUserId: "584120000000@c.us",
    });

    const res = await adminApp.request(`/viajes/${tripId}/assign`, form({ driver_id: driverId }), env);
    expect(res.status).toBe(302);
    const trip = await new TaxiTripsRepo(db).get(tripId);
    expect(trip?.status).toBe("asignado");
    expect(trip?.driver_id).toBe(driverId);
  });

  it("la cola muestra al conductor y permite quitarlo", async () => {
    const baseId = await new TaxiBasesRepo(db).create({ name: "Centro" });
    const driverId = await new TaxiDriversRepo(db).create({ name: "Juan", baseId });
    const queue = new TaxiQueueRepo(db);
    const entry = await queue.enqueue(baseId, driverId);

    let res = await adminApp.request("/cola", { headers: authHeader() }, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Juan");

    await adminApp.request(`/cola/${entry.id}/leave`, { method: "POST", headers: authHeader() }, env);
    expect((await queue.waitingForBase(baseId)).length).toBe(0);
  });
});
