import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { ConversationsRepo } from "../../src/db/conversations";
import { MessagesRepo } from "../../src/db/messages";
import { ConversationLabelsRepo } from "../../src/db/conversationLabels";
import { TriggersRepo } from "../../src/db/triggers";
import { evaluateTriggers } from "../../src/triggers/engine";

let env: any;
let db: Db;
let convId: string;
let repo: TriggersRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
  env = { DB: db.d1, TELEGRAM_BOT_TOKEN: "test-token", DASHBOARD_BASE_URL: "https://bot.test" };
  convId = (await new ConversationsRepo(db).getOrCreate("telegram", "u1")).id;
  repo = new TriggersRepo(db);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

const ctx = (text: string) => ({ conversationId: convId, channel: "telegram" as const, channelUserId: "u1", text });

describe("evaluateTriggers", () => {
  it("keyword → reply_fixed: responde y queda en el hilo", async () => {
    await repo.upsert({ name: "Precio", matchKind: "keyword", keywords: ["precio", "cuánto"], action: "reply_fixed", actionPayload: { message: "Aquí van los precios 👇" } });
    const out = await evaluateTriggers(env, ctx("hola, ¿cuál es el precio?"));
    expect(out.replied).toBe(true);
    const msgs = await new MessagesRepo(db).lastN(convId, 5);
    expect(msgs.some((m) => m.role === "assistant" && m.content.includes("precios"))).toBe(true);
  });

  it("keyword → label: etiqueta sin responder", async () => {
    await repo.upsert({ name: "Factura", matchKind: "keyword", keywords: ["factura"], action: "label", actionPayload: { label: "pide_factura" } });
    const out = await evaluateTriggers(env, ctx("necesito mi factura"));
    expect(out.replied).toBe(false);
    expect(await new ConversationLabelsRepo(db).has(convId, "pide_factura")).toBe(true);
  });

  it("no dispara si no matchea la palabra", async () => {
    await repo.upsert({ name: "Precio", matchKind: "keyword", keywords: ["precio"], action: "reply_fixed", actionPayload: { message: "x" } });
    const out = await evaluateTriggers(env, ctx("buenas tardes"));
    expect(out.matched).toEqual([]);
    expect(out.replied).toBe(false);
  });

  it("run_once: no vuelve a responder en la misma conversación", async () => {
    await repo.upsert({ name: "Saludo", matchKind: "keyword", keywords: ["hola"], action: "reply_fixed", actionPayload: { message: "¡Hola!" }, runOncePerConversation: true });
    const first = await evaluateTriggers(env, ctx("hola"));
    const second = await evaluateTriggers(env, ctx("hola otra vez"));
    expect(first.replied).toBe(true);
    expect(second.replied).toBe(false);
    expect(second.matched).toEqual([]);
  });

  it("match_kind=any dispara siempre", async () => {
    await repo.upsert({ name: "Siempre", matchKind: "any", action: "label", actionPayload: { label: "tocado" } });
    const out = await evaluateTriggers(env, ctx("cualquier cosa"));
    expect(out.matched).toHaveLength(1);
    expect(await new ConversationLabelsRepo(db).has(convId, "tocado")).toBe(true);
  });

  it("ignora disparadores deshabilitados", async () => {
    const id = await repo.upsert({ name: "Off", matchKind: "keyword", keywords: ["x"], action: "reply_fixed", actionPayload: { message: "y" } });
    await repo.setEnabled(id, false);
    const out = await evaluateTriggers(env, ctx("x"));
    expect(out.replied).toBe(false);
  });

  it("flow: manda los pasos sin demora y AGENDA los demás (delay_minutes)", async () => {
    const id = await repo.upsert({ name: "Secuencia", matchKind: "keyword", keywords: ["guia"], action: "flow" });
    await repo.setSteps(id, [
      { kind: "text", content: "Paso 1", delayMinutes: 0 },
      { kind: "text", content: "Paso 2", delayMinutes: 5 },
    ]);
    const scheduled: { delayMinutes: number; text: string }[][] = [];
    const out = await evaluateTriggers(env, { ...ctx("quiero la guia"), scheduleFlow: (s) => scheduled.push(s) });

    expect(out.replied).toBe(true);
    // Paso 1 se manda ya y queda en el hilo.
    const msgs = await new MessagesRepo(db).lastN(convId, 5);
    expect(msgs.some((m) => m.role === "assistant" && m.content === "Paso 1")).toBe(true);
    // Paso 2 se agenda (no se manda aún).
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toEqual([{ delayMinutes: 5, text: "Paso 2" }]);
    expect(msgs.some((m) => m.content === "Paso 2")).toBe(false);
  });

  it("flow: un paso con @recurso adjunta el recurso de la biblioteca (imagen)", async () => {
    const { SettingsRepo, SETTING_KEYS } = await import("../../src/db/settings");
    await new SettingsRepo(db).set(
      SETTING_KEYS.resourceLibrary,
      JSON.stringify({ ofertas: { kind: "image", url: "https://x/ofertas.jpg" } }),
    );
    const id = await repo.upsert({ name: "Seqv", matchKind: "keyword", keywords: ["oferta"], action: "flow" });
    await repo.setSteps(id, [{ kind: "text", content: "Mirá", delayMinutes: 0, resource: "ofertas" }]);

    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any, init: any) => {
        calls.push([String(url), init]);
        return new Response("{}", { status: 200 });
      }),
    );

    const out = await evaluateTriggers(env, ctx("quiero la oferta"));
    expect(out.replied).toBe(true);
    const photo = calls.find(([u]) => u.includes("/sendPhoto"));
    expect(photo).toBeTruthy();
    expect(JSON.parse(photo![1].body as string).photo).toBe("https://x/ofertas.jpg");
  });
});
