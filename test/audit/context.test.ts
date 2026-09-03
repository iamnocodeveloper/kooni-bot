import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import { AuditRepo } from "../../src/db/auditLog";
import { runWithActor, currentActor, redactValue, recordAudit } from "../../src/audit/context";

let db: Db;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
});

describe("redactValue", () => {
  it("redacta claves sensibles mostrando solo los últimos 4", () => {
    expect(redactValue(SETTING_KEYS.llmApiKey, "sk-proj-ABCDEF1234")).toBe("[secreto · termina en …1234]");
    expect(redactValue(SETTING_KEYS.mlClientSecret, "")).toBe("[vacío]");
  });
  it("deja pasar valores no sensibles (recortando los muy largos)", () => {
    expect(redactValue(SETTING_KEYS.tone, "cálido")).toBe("cálido");
    expect(redactValue(SETTING_KEYS.businessContext, "x".repeat(5000)).length).toBe(2001);
  });
});

describe("runWithActor / currentActor", () => {
  it("expone el actor dentro del scope y nada fuera", async () => {
    expect(currentActor()).toBeUndefined();
    await runWithActor({ name: "admin", ipHash: "abc", path: "/admin/config" }, async () => {
      expect(currentActor()?.ipHash).toBe("abc");
    });
    expect(currentActor()).toBeUndefined();
  });
});

describe("recordAudit", () => {
  it("no escribe nada si no hay actor en contexto", async () => {
    await recordAudit(db, { action: "settings.update", target: "tone" });
    expect(await new AuditRepo(db).count()).toBe(0);
  });

  it("escribe una fila ligada al actor cuando hay contexto", async () => {
    await runWithActor({ name: "admin", ipHash: "iphash1", ua: "curl", method: "POST", path: "/admin/config" }, () =>
      recordAudit(db, { action: "settings.update", target: "tone", targetLabel: "Tono del bot", beforeVal: "a", afterVal: "b" }),
    );
    const [row] = await new AuditRepo(db).list();
    expect(row.action).toBe("settings.update");
    expect(row.actorIpHash).toBe("iphash1");
    expect(row.beforeVal).toBe("a");
    expect(row.afterVal).toBe("b");
    expect(row.path).toBe("/admin/config");
  });
});

describe("SettingsRepo.set — captura de auditoría", () => {
  it("NO audita cuando se llama fuera del panel (sin actor)", async () => {
    await new SettingsRepo(db).set(SETTING_KEYS.tone, "formal");
    expect(await new AuditRepo(db).count()).toBe(0);
  });

  it("audita el antes → después cuando hay un operador", async () => {
    const repo = new SettingsRepo(db);
    await repo.set(SETTING_KEYS.tone, "cálido"); // sin actor: no audita
    await runWithActor({ name: "admin", ipHash: "h", method: "POST", path: "/admin/config" }, async () => {
      await repo.set(SETTING_KEYS.tone, "formal");
    });
    const rows = await new AuditRepo(db).list();
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe(SETTING_KEYS.tone);
    expect(rows[0].targetLabel).toBe("Tono del bot");
    expect(rows[0].beforeVal).toBe("cálido");
    expect(rows[0].afterVal).toBe("formal");
  });

  it("no audita si el valor no cambió", async () => {
    const repo = new SettingsRepo(db);
    await runWithActor({ name: "admin" }, async () => {
      await repo.set(SETTING_KEYS.tone, "formal");
      await repo.set(SETTING_KEYS.tone, "formal");
    });
    expect(await new AuditRepo(db).count()).toBe(1);
  });

  it("nunca guarda un secreto en claro", async () => {
    const repo = new SettingsRepo(db);
    await runWithActor({ name: "admin" }, async () => {
      await repo.set(SETTING_KEYS.zernioApiKey, "zk-SUPERSECRET-9999");
    });
    const [row] = await new AuditRepo(db).list();
    expect(row.afterVal).toBe("[secreto · termina en …9999]");
    expect(JSON.stringify(row)).not.toContain("SUPERSECRET");
  });
});
