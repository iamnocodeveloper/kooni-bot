import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { adminApp } from "../../src/admin/routes";
import { Db } from "../../src/db/client";
import { OrdersRepo } from "../../src/db/orders";
import { ProductsRepo } from "../../src/db/products";
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
    BUSINESS_NAME: "El Local",
    BOT_LANGUAGE: "es",
    BUFFER_SECONDS: "8",
    DASHBOARD_PASSWORD: PASSWORD,
    BOT_NICHE: "restaurante",
  } as unknown as Env;
});

describe("rutas del nicho restaurante", () => {
  it("GET /admin/pedidos y /admin/menu y /admin/reportes responden 200 con BOT_NICHE=restaurante", async () => {
    for (const path of ["/pedidos", "/menu", "/reportes"]) {
      const res = await adminApp.request(path, { headers: authHeader() }, env);
      expect(res.status, path).toBe(200);
      expect((await res.text()).length).toBeGreaterThan(100);
    }
  });

  it("sin el nicho, esas rutas redirigen a /admin/overview", async () => {
    const other = { ...env, BOT_NICHE: "generico" } as Env;
    for (const path of ["/pedidos", "/menu", "/reportes"]) {
      const res = await adminApp.request(path, { headers: authHeader() }, other);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/admin/overview");
    }
  });

  it("menú: crear, editar precio, marcar agotado, borrar", async () => {
    const products = new ProductsRepo(db);

    let res = await adminApp.request("/menu", form({ name: "Taco", price: "35", category: "principales" }), env);
    expect(res.status).toBe(302);
    let all = await products.all();
    expect(all).toHaveLength(1);
    const id = all[0].id;

    await adminApp.request(`/menu/${id}`, form({ name: "Taco al pastor", price: "40" }), env);
    expect((await products.get(id))!.price).toBe(40);

    await adminApp.request(`/menu/${id}/toggle`, { method: "POST", headers: authHeader() }, env);
    expect((await products.get(id))!.active).toBe(0);
    expect(await products.available()).toHaveLength(0);

    await adminApp.request(`/menu/${id}/delete`, { method: "POST", headers: authHeader() }, env);
    expect(await products.all()).toHaveLength(0);
  });

  it("cambiar el estado de un pedido desde el panel avanza el flujo", async () => {
    const { id } = await new OrdersRepo(db).create({
      channel: "telegram",
      channelUserId: "999",
      customerName: "Ana",
      paymentMethod: "efectivo",
      items: [{ name: "X", qty: 1, unitPrice: 100 }],
    });
    const res = await adminApp.request(`/pedidos/${id}/status`, form({ status: "confirmado" }), env);
    expect(res.status).toBe(302);
    expect((await new OrdersRepo(db).get(id))!.status).toBe("confirmado");
  });

  it("una transición inválida no cambia el pedido y avisa por query", async () => {
    const repo = new OrdersRepo(db);
    const { id } = await repo.create({ channel: "telegram", channelUserId: "1", paymentMethod: "efectivo", items: [{ name: "X", qty: 1, unitPrice: 10 }] });
    await repo.setStatus(id, "entregado");
    const res = await adminApp.request(`/pedidos/${id}/status`, form({ status: "camino" }), env);
    expect(res.headers.get("location")).toContain("err=transicion");
    expect((await repo.get(id))!.status).toBe("entregado");
  });

  it("export.csv devuelve un CSV descargable", async () => {
    const res = await adminApp.request("/reportes/export.csv", { headers: authHeader() }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("reportes-restaurante.csv");
  });

  it("/admin/pedidos/feed devuelve los ids de los pedidos activos + latestAt", async () => {
    const repo = new OrdersRepo(db);
    const a = await repo.create({ channel: "telegram", channelUserId: "1", paymentMethod: "efectivo", items: [{ name: "X", qty: 1, unitPrice: 10 }] });
    const b = await repo.create({ channel: "telegram", channelUserId: "2", paymentMethod: "efectivo", items: [{ name: "Y", qty: 1, unitPrice: 10 }] });
    await repo.setStatus(b.id, "entregado"); // sale del feed

    const res = await adminApp.request("/pedidos/feed", { headers: authHeader() }, env);
    const j = (await res.json()) as any;
    expect(j.ids).toEqual([a.id]);
    expect(j.count).toBe(1);
    expect(j.latestAt).toBeGreaterThan(0);
  });

  it("la pantalla de pedidos trae el poll del feed y el botón de sonido", async () => {
    const res = await adminApp.request("/pedidos", { headers: authHeader() }, env);
    const html = await res.text();
    expect(html).toContain("/admin/pedidos/feed");
    expect(html).toContain('id="ped-sound"');
    expect(html).toContain("Modo mostrador");
  });

  it("feed vacío (302→json) si no es el nicho restaurante", async () => {
    const other = { ...env, BOT_NICHE: "clinica" } as Env;
    const res = await adminApp.request("/pedidos/feed", { headers: authHeader() }, other);
    const j = (await res.json()) as any;
    expect(j.ids).toEqual([]);
  });
});

describe("manifest PWA del restaurante", () => {
  it("abre en Pedidos y sus shortcuts son de restaurante", async () => {
    const { manifest } = await import("../../src/admin/pwa");
    const m = JSON.parse(manifest({ BOT_NICHE: "restaurante" } as any));
    expect(m.start_url).toContain("/admin/pedidos");
    expect(m.shortcuts.map((s: any) => s.name)).toEqual(["Pedidos", "Menú", "Reportes"]);
  });

  it("otro giro mantiene el manifest normal", async () => {
    const { manifest } = await import("../../src/admin/pwa");
    const m = JSON.parse(manifest({ BOT_NICHE: "generico" } as any));
    expect(m.start_url).toBe("/admin/overview");
  });
});
