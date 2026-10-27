import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { adminApp } from "../../src/admin/routes";
import { Db } from "../../src/db/client";
import { ConversationsRepo, PAUSE_INDEFINITE } from "../../src/db/conversations";
import { ContactBlocksRepo } from "../../src/db/contactBlocks";
import type { Env } from "../../src/env";

const PASSWORD = "secret123";

function basicAuthHeader(user: string, pass: string): string {
  const raw = `${user}:${pass}`;
  const b64 = typeof btoa === "function" ? btoa(raw) : Buffer.from(raw, "utf-8").toString("base64");
  return `Basic ${b64}`;
}

const AUTH = { Authorization: basicAuthHeader("admin", PASSWORD) };
const FORM = { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" };

let env: Env;
let db: Db;
let convs: ConversationsRepo;
let blocks: ContactBlocksRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = (await mf.getD1Database("DB")) as any;
  env = {
    DB: d1,
    BOT_NAME: "TestBot",
    BUSINESS_NAME: "Negocio de Prueba",
    BOT_LANGUAGE: "es",
    BOT_TIER: "pro",
    BUFFER_SECONDS: "8",
    DASHBOARD_PASSWORD: PASSWORD,
  } as unknown as Env;
  db = new Db(d1);
  convs = new ConversationsRepo(db);
  blocks = new ContactBlocksRepo(db);
});

describe("bloqueo e pausa indefinida desde el panel", () => {
  it("bloquea y desbloquea el contacto desde el hilo", async () => {
    const conv = await convs.getOrCreate("telegram", "u-block", "Cliente");

    const blocked = await adminApp.request(
      `/conversations/${encodeURIComponent(conv.id)}/block`,
      { method: "POST", headers: FORM, body: new URLSearchParams({}) },
      env,
    );
    expect(blocked.status).toBe(200);
    expect(await blocks.isBlocked("telegram", "u-block")).toBe(true);
    expect(await blocked.text()).toContain("bloqueado");

    const unblocked = await adminApp.request(
      `/conversations/${encodeURIComponent(conv.id)}/unblock`,
      { method: "POST", headers: FORM, body: new URLSearchParams({}) },
      env,
    );
    expect(unblocked.status).toBe(200);
    expect(await blocks.isBlocked("telegram", "u-block")).toBe(false);
  });

  it("pausa hasta reactivar usa el sentinel indefinido", async () => {
    const conv = await convs.getOrCreate("telegram", "u-pause");
    const res = await adminApp.request(
      `/conversations/${encodeURIComponent(conv.id)}/pause-forever`,
      { method: "POST", headers: FORM, body: new URLSearchParams({}) },
      env,
    );
    expect(res.status).toBe(200);
    const fresh = await convs.getById(conv.id);
    expect(fresh?.paused_until).toBe(PAUSE_INDEFINITE);
    expect(await convs.isPaused(conv.id)).toBe(true);
  });

  it("la página /blocked permite bloquear por identificador manual y lista el contacto", async () => {
    const res = await adminApp.request(
      "/blocked",
      {
        method: "POST",
        headers: FORM,
        body: new URLSearchParams({ target: "waha|59170000000@c.us", reason: "pidió no recibir mensajes" }),
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(await blocks.isBlocked("waha", "59170000000@c.us")).toBe(true);

    const page = await adminApp.request("/blocked", { headers: AUTH }, env);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("59170000000@c.us");
    expect(html).toContain("pidió no recibir mensajes");
  });
});
