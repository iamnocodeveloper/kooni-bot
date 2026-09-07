import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { adminApp } from "../../src/admin/routes";
import { Db } from "../../src/db/client";
import { LeadsRepo } from "../../src/db/leads";
import { ConversationsRepo } from "../../src/db/conversations";
import type { Env } from "../../src/env";

const PASSWORD = "secret123";
const auth = () => ({ Authorization: `Basic ${Buffer.from(`admin:${PASSWORD}`).toString("base64")}` });

let env: Env;
let db: Db;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
  env = {
    DB: db.d1,
    BOT_NAME: "Bot",
    BUSINESS_NAME: "Neg",
    BOT_LANGUAGE: "es",
    BUFFER_SECONDS: "8",
    DASHBOARD_PASSWORD: PASSWORD,
  } as unknown as Env;

  const leads = new LeadsRepo(db);
  await leads.create({ name: "Ana", intent: "quiere info", conversationId: null, channelUserId: null });
  const conv = await new ConversationsRepo(db).getOrCreate("telegram", "u9");
  await leads.ensureEntrada(conv.id);
});

describe("kanban de leads", () => {
  it("GET /admin/leads muestra el kanban con las 5 columnas (entrada..perdido)", async () => {
    const res = await adminApp.request("/leads", { headers: auth() }, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const col of ["Entrada", "Nuevo", "Contactado", "Vendido", "Perdido"]) {
      expect(html).toContain(col);
    }
    expect(html).toContain("kb-col");
    expect(html).toContain("data-status=\"entrada\"");
  });

  it("?vista=tabla muestra la tabla en vez del kanban", async () => {
    const res = await adminApp.request("/leads?vista=tabla", { headers: auth() }, env);
    const html = await res.text();
    expect(html).toContain("<table");
    expect(html).not.toContain("kb-col");
  });

  it("mover una ficha con header x-kanban devuelve 204 y actualiza el estado", async () => {
    const leads = new LeadsRepo(db);
    const list = await leads.list(10);
    const id = list.find((l) => l.name === "Ana")!.id;

    const res = await adminApp.request(
      `/leads/${id}/status`,
      {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/x-www-form-urlencoded", "x-kanban": "1" },
        body: new URLSearchParams({ status: "contacted" }).toString(),
      },
      env,
    );
    expect(res.status).toBe(204);
    expect((await leads.list(10)).find((l) => l.id === id)!.status).toBe("contacted");
  });

  it("mover sin x-kanban redirige a /admin/leads", async () => {
    const leads = new LeadsRepo(db);
    const id = (await leads.list(10))[0].id;
    const res = await adminApp.request(
      `/leads/${id}/status`,
      {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ status: "sold" }).toString(),
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/leads");
  });
});
