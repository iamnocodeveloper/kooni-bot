import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { adminApp } from "../../src/admin/routes";
import { Db } from "../../src/db/client";
import { LabRepo } from "../../src/db/lab";
import type { Env } from "../../src/env";

const PASSWORD = "secret123";
const authHeader = () => ({ Authorization: `Basic ${Buffer.from(`admin:${PASSWORD}`).toString("base64")}` });
const form = (o: Record<string, string>) => ({
  method: "POST",
  headers: { ...authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

let env: Env;
let db: Db;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  db = new Db(d1 as any);
  env = { DB: d1, BOT_NAME: "Bot", BUSINESS_NAME: "El Local", BOT_LANGUAGE: "es", BUFFER_SECONDS: "8", DASHBOARD_PASSWORD: PASSWORD } as unknown as Env;
  // El POST lanza runLab en background (waitUntil): sin red, los turnos del
  // modelo fallan rápido y la corrida se cierra como fallida. No bloquea el test.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red en tests"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("rutas del Laboratorio", () => {
  it("GET /laboratorio renderiza el estado vacío", async () => {
    const res = await adminApp.request("/laboratorio", { headers: authHeader() }, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Laboratorio");
  });

  it("GET /laboratorio/run/:id responde 200 (aunque el id no exista)", async () => {
    const res = await adminApp.request("/laboratorio/run/no-existe", { headers: authHeader() }, env);
    expect(res.status).toBe(200);
  });

  it("POST /laboratorio/run crea la corrida y redirige a su detalle", async () => {
    const execCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;
    const res = await adminApp.request("/laboratorio/run", form({ kind: "quick" }), env, execCtx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/admin\/laboratorio\/run\//);

    const runs = await new LabRepo(db).listRuns("quick", 5);
    expect(runs.length).toBeGreaterThanOrEqual(1);
  });

  it("bloquea sin auth (401)", async () => {
    const res = await adminApp.request("/laboratorio", {}, env);
    expect(res.status).toBe(401);
  });
});
