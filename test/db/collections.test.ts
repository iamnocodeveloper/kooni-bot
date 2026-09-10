import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { CollectionsRepo, daysOverdue, normalizePhone } from "../../src/db/collections";

let repo: CollectionsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  repo = new CollectionsRepo(new Db(d1 as any));
});

describe("CollectionsRepo (cartera de cobros)", () => {
  it("alta idempotente por referencia y búsqueda por teléfono", async () => {
    const a = await repo.upsertDebtor({ name: "Juan Pérez", phone: "+506 8888-7777", externalRef: "CLI-001" });
    const b = await repo.upsertDebtor({ name: "Juan P.", externalRef: "CLI-001" });
    expect(b.id).toBe(a.id);
    expect(b.created).toBe(false);

    const byPhone = await repo.getDebtorByPhone("50688887777");
    expect(byPhone?.id).toBe(a.id);
    const byRef = await repo.getDebtorByRef("CLI-001");
    expect(byRef?.id).toBe(a.id);
    expect(normalizePhone("+506 8888-7777")).toBe("50688887777");
  });

  it("saldo, cuentas y pago (registra abono y marca pagada)", async () => {
    const { id } = await repo.upsertDebtor({ name: "Ana", phone: "50611112222", externalRef: "CLI-002" });
    const acc = await repo.addAccount({ debtorId: id, amount: 1000, dueDate: Date.now() - 5 * 86_400_000 });

    let d = await repo.getDebtor(id);
    expect(d?.balance).toBe(1000);
    expect(d?.accounts).toBe(1);

    await repo.registerPayment(acc, 400);
    d = await repo.getDebtor(id);
    expect(d?.balance).toBe(600);

    await repo.registerPayment(acc, 600);
    const accounts = await repo.listAccounts(id);
    expect(accounts[0].status).toBe("paid");
    d = await repo.getDebtor(id);
    expect(d?.balance).toBe(0);
  });

  it("promesas de pago + etapa del caso + interacciones", async () => {
    const { id } = await repo.upsertDebtor({ name: "Luis", phone: "50633334444", externalRef: "CLI-003" });
    const p = await repo.createPromise({ debtorId: id, amount: 500, promisedDate: Date.now() + 86_400_000 });
    const promises = await repo.listPromises(id);
    expect(promises).toHaveLength(1);
    expect(promises[0].status).toBe("pending");

    const caseId = await repo.ensureCase(id);
    await repo.setCaseStage(caseId, "promesa");
    await repo.logInteraction({ caseId, debtorId: id, channel: "whatsapp", direction: "in", kind: "nota", summary: "prometió pagar", outcome: "promesa" });
    const inter = await repo.listInteractions(id);
    expect(inter).toHaveLength(1);
    expect(inter[0].outcome).toBe("promesa");

    await repo.setPromiseStatus(p, "kept");
    expect((await repo.listPromises()).find((x) => x.id === p)).toBeUndefined();
  });

  it("stats agrega deuda, mora, promesas y recuperado", async () => {
    const { id } = await repo.upsertDebtor({ name: "Mora", phone: "50655556666", externalRef: "CLI-004" });
    const acc = await repo.addAccount({ debtorId: id, amount: 2000, dueDate: Date.now() - 10 * 86_400_000 });
    await repo.addAccount({ debtorId: id, amount: 500, dueDate: Date.now() + 10 * 86_400_000 });
    await repo.registerPayment(acc, 1000);
    await repo.createPromise({ debtorId: id, amount: 300, promisedDate: Date.now() + 86_400_000 });

    const s = await repo.stats();
    expect(s.debtors).toBe(1);
    expect(s.totalPaid).toBe(1000);
    expect(s.promised).toBe(300);
    expect(s.overdue).toBe(1000); // cuenta morosa: 2000 - 1000 abonado
    expect(s.totalDebt).toBe(1500); // (2000-1000) + 500
  });

  it("daysOverdue calcula días de mora", () => {
    expect(daysOverdue(null)).toBe(0);
    expect(daysOverdue(Date.now() + 86_400_000)).toBe(0);
    expect(daysOverdue(Date.now() - 3 * 86_400_000)).toBe(3);
  });
});
