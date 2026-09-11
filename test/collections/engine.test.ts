import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { CollectionsRepo } from "../../src/db/collections";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import { runCollections } from "../../src/collections/engine";
import type { Env } from "../../src/env";

let db: Db;
let repo: CollectionsRepo;
let env: Env;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  db = new Db(d1 as any);
  repo = new CollectionsRepo(db);
  env = { DB: d1, BUSINESS_NAME: "Cobros SA", WAHA_API_URL: "https://waha.test", WAHA_API_KEY: "k" } as unknown as Env;
});

afterEach(() => vi.restoreAllMocks());

/** Deudor con una cuenta vencida hace `days` días. */
async function seedDebtor(days: number, ref = "C1") {
  const { id } = await repo.upsertDebtor({ name: "Juan", phone: "50688887777", externalRef: ref });
  await repo.addAccount({ debtorId: id, amount: 1000, dueDate: Date.now() - days * 86_400_000 });
  return id;
}

describe("motor de cobranza (runCollections)", () => {
  it("manda el recordatorio del tramo, lo guarda en el CRM y suma intento", async () => {
    const debtorId = await seedDebtor(3);
    await repo.upsertRule({ name: "1-7d", minDaysOverdue: 1, maxDaysOverdue: 7, maxAttempts: 3 });
    const sent: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any, init: any) => {
        sent.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    const r = await runCollections(env, { force: true });
    expect(r.sent).toBe(1);
    expect(sent[0].url).toContain("/api/sendText");
    expect(sent[0].body.chatId).toBe("50688887777@c.us");

    const inter = await repo.listInteractions(debtorId);
    expect(inter[0].outcome).toBe("recordatorio");
    const accounts = await repo.listAccounts(debtorId);
    expect(accounts[0].status).toBe("open");

    // Segunda corrida inmediata → cooldown, no manda de nuevo.
    const r2 = await runCollections(env, { force: true });
    expect(r2.sent).toBe(0);
    expect(r2.skipped).toBeGreaterThanOrEqual(1);
  });

  it("respeta el opt-out (DNC): no le escribe", async () => {
    const debtorId = await seedDebtor(3, "C2");
    await repo.upsertRule({ name: "1-7d", minDaysOverdue: 1, maxDaysOverdue: 7 });
    await repo.setDnc(debtorId, true, "pidió no ser contactado");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await runCollections(env, { force: true });
    expect(r.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await repo.isDnc(debtorId)).toBe(true);
  });

  it("respeta la ventana horaria (fuera de horario no manda)", async () => {
    await seedDebtor(3, "C3");
    await repo.upsertRule({ name: "1-7d", minDaysOverdue: 1, maxDaysOverdue: 7 });
    const h = new Date().getUTCHours();
    await new SettingsRepo(db).set(SETTING_KEYS.collectionSendFromHour, String((h + 1) % 24));
    await new SettingsRepo(db).set(SETTING_KEYS.collectionSendToHour, String((h + 2) % 24));
    await new SettingsRepo(db).set(SETTING_KEYS.collectionTzOffsetMinutes, "0");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await runCollections(env); // sin force → aplica ventana
    expect(r.windowed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    // Con force (botón "correr ahora") la ignora.
    const r2 = await runCollections(env, { force: true });
    expect(r2.windowed).toBeUndefined();
  });

  it("una regla de canal 'voz' dispara la llamada (no un mensaje)", async () => {
    await seedDebtor(15, "C4");
    await repo.upsertRule({ name: "voz 10+", minDaysOverdue: 10, maxDaysOverdue: null, channel: "voz" });
    // Vapi configurado en settings.
    const s = new SettingsRepo(db);
    await s.set(SETTING_KEYS.voiceProvider, "vapi");
    await s.set(SETTING_KEYS.vapiApiKey, "sk_test");
    await s.set(SETTING_KEYS.vapiAssistantId, "asst_1");
    await s.set(SETTING_KEYS.vapiPhoneNumberId, "pn_1");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ id: "call_1" }), { status: 200 });
      }),
    );

    const r = await runCollections(env, { force: true });
    expect(r.sent).toBe(1);
    expect(calls.some((u) => u.endsWith("/call"))).toBe(true);
    expect(calls.some((u) => u.includes("/api/sendText"))).toBe(false);
  });

  it("sin reglas solo marca promesas vencidas", async () => {
    const { id } = await repo.upsertDebtor({ name: "X", phone: "50600000000", externalRef: "C5" });
    await repo.createPromise({ debtorId: id, amount: 100, promisedDate: Date.now() - 48 * 3_600_000 });
    const r = await runCollections(env, { force: true });
    expect(r.rules).toBe(0);
    expect(r.promisesBroken).toBe(1);
  });
});

describe("pagos y reportes", () => {
  it("pagar la cuenta marca la promesa como cumplida y el caso como pagado", async () => {
    const { id } = await repo.upsertDebtor({ name: "P", phone: "50611111111", externalRef: "P1" });
    const acc = await repo.addAccount({ debtorId: id, amount: 500 });
    await repo.createPromise({ debtorId: id, accountId: acc, amount: 500, promisedDate: Date.now() + 86_400_000 });
    const caseId = await repo.ensureCase(id, acc);

    await repo.registerPayment(acc, 500);

    const promises = await repo.listPromises(id);
    expect(promises[0].status).toBe("kept");
    const d = await repo.getDebtor(id);
    expect(d?.stage).toBe("pagado");
    expect((await repo.getDebtor(id))?.balance).toBe(0);
    expect(caseId).toBeTruthy();
  });

  it("report() agrega recuperación, por canal y embudo", async () => {
    const { id } = await repo.upsertDebtor({ name: "R", phone: "50622222222", externalRef: "R1" });
    const acc = await repo.addAccount({ debtorId: id, amount: 1000 });
    await repo.registerPayment(acc, 400);
    const caseId = await repo.ensureCase(id, acc);
    await repo.logAttempt(caseId, id, "whatsapp", "contactado");
    await repo.logAttempt(caseId, id, "whatsapp", "promesa");
    await repo.logAttempt(caseId, id, "voz", "pago");

    const rep = await repo.report();
    expect(rep.totalPaid).toBe(400);
    expect(rep.totalDebt).toBe(600);
    expect(rep.recoveryRate).toBeCloseTo(0.4, 5);
    const wa = rep.byChannel.find((c) => c.channel === "whatsapp");
    expect(wa?.intentos).toBe(2);
    expect(wa?.promesas).toBe(1);
    expect(rep.byStage.length).toBeGreaterThanOrEqual(1);
  });

  it("listDebtors filtra por lista/etapa y pagina", async () => {
    const listId = await repo.createList("L1");
    for (let i = 0; i < 3; i++) {
      const { id } = await repo.upsertDebtor({ name: `D${i}`, phone: `5060000000${i}`, externalRef: `L1-${i}`, listId });
      await repo.addAccount({ debtorId: id, amount: 100, dueDate: Date.now() - 2 * 86_400_000 });
    }
    const all = await repo.listDebtors({ listId, limit: 2, offset: 0 });
    expect(all).toHaveLength(2);
    const next = await repo.listDebtors({ listId, limit: 2, offset: 2 });
    expect(next).toHaveLength(1);
  });
});
