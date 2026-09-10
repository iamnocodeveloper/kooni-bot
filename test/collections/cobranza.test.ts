import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { CollectionsRepo } from "../../src/db/collections";
import { renderCollectionTemplate } from "../../src/collections/engine";
import { outcomeFromCallText } from "../../src/collections/voice";

let repo: CollectionsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  repo = new CollectionsRepo(new Db(d1 as any));
});

describe("motor de cobranza — plantillas", () => {
  it("reemplaza las variables reales del deudor", () => {
    const out = renderCollectionTemplate("Hola {nombre}, saldo {saldo} vence {vence} ({dias} días) — {negocio}", {
      nombre: "Juan",
      negocio: "Cobros SA",
      saldo: "$1,500",
      monto: "$1,500",
      vence: "2026-08-01",
      dias: "12",
    });
    expect(out).toBe("Hola Juan, saldo $1,500 vence 2026-08-01 (12 días) — Cobros SA");
  });

  it("deja vacío lo que no viene (nunca inventa)", () => {
    expect(renderCollectionTemplate("Hola {nombre} {desconocido}", {
      nombre: "",
      negocio: "",
      saldo: "",
      monto: "",
      vence: "",
      dias: "",
    })).toBe("Hola  {desconocido}");
  });
});

describe("resultado de la llamada (voz)", () => {
  it("mapea el análisis a un outcome de cartera", () => {
    expect(outcomeFromCallText("El cliente prometió pagar el viernes")).toBe("promesa");
    expect(outcomeFromCallText("Dice que ya pagó ayer")).toBe("pago");
    expect(outcomeFromCallText("No reconoce la deuda, reclama")).toBe("disputa");
    expect(outcomeFromCallText("No contesta, salió el buzón de voz")).toBe("sin_respuesta");
    expect(outcomeFromCallText("Número inválido")).toBe("numero_invalido");
    expect(outcomeFromCallText("Hablamos y quedó en revisar")).toBe("contactado");
    expect(outcomeFromCallText("", "customer-did-not-answer")).toBe("sin_respuesta");
  });
});

describe("reglas de cobranza", () => {
  it("crea, lista, actualiza y borra reglas", async () => {
    const id = await repo.upsertRule({ name: "1-7 días", minDaysOverdue: 1, maxDaysOverdue: 7, maxAttempts: 3 });
    let rules = await repo.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("1-7 días");

    await repo.upsertRule({ id, name: "1-7 días (v2)", minDaysOverdue: 1, maxDaysOverdue: 7, maxAttempts: 5 });
    rules = await repo.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].max_attempts).toBe(5);

    await repo.deleteRule(id);
    expect(await repo.listRules()).toHaveLength(0);
  });

  it("accountsInOverdueRange trae solo las cuentas del tramo", async () => {
    const { id } = await repo.upsertDebtor({ name: "A", phone: "50611110000", externalRef: "R1" });
    await repo.addAccount({ debtorId: id, amount: 100, dueDate: Date.now() - 3 * 86_400_000 }); // 3 días
    await repo.addAccount({ debtorId: id, amount: 200, dueDate: Date.now() - 40 * 86_400_000 }); // 40 días
    await repo.addAccount({ debtorId: id, amount: 300, dueDate: Date.now() + 5 * 86_400_000 }); // al día

    const tramo1a7 = await repo.accountsInOverdueRange(1, 7);
    expect(tramo1a7).toHaveLength(1);
    expect(tramo1a7[0].amount).toBe(100);

    const tramo30mas = await repo.accountsInOverdueRange(30, null);
    expect(tramo30mas).toHaveLength(1);
    expect(tramo30mas[0].amount).toBe(200);
  });

  it("promisesDue y markBrokenPromises", async () => {
    const { id } = await repo.upsertDebtor({ name: "B", phone: "50622220000", externalRef: "R2" });
    await repo.createPromise({ debtorId: id, amount: 500, promisedDate: Date.now() + 6 * 3_600_000 }); // en 6h
    await repo.createPromise({ debtorId: id, amount: 700, promisedDate: Date.now() - 48 * 3_600_000 }); // vencida hace 2d

    const due = await repo.promisesDue(24);
    expect(due.length).toBeGreaterThanOrEqual(2);

    const broken = await repo.markBrokenPromises(24);
    expect(broken).toBe(1);
    const pending = await repo.listPromises(id);
    expect(pending.filter((p) => p.status === "pending")).toHaveLength(1);
  });
});
