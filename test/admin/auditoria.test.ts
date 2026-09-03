import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { adminApp } from "../../src/admin/routes";
import { Db } from "../../src/db/client";
import { AuditRepo } from "../../src/db/auditLog";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import { renderAuditoria, exportAuditCsv } from "../../src/admin/views/auditoria";
import { runWithActor } from "../../src/audit/context";
import { layout } from "../../src/admin/views/layout";
import { PRO_ONLY_TABS } from "../../src/config";
import { PAID_MODULES } from "../../src/modules";
import { makeDb, testLicense } from "../helpers/license";
import type { Env } from "../../src/env";

const PASSWORD = "secret123";
const authHeader = () => {
  const raw = `admin:${PASSWORD}`;
  const b64 = typeof btoa === "function" ? btoa(raw) : Buffer.from(raw).toString("base64");
  return { Authorization: `Basic ${b64}` };
};

let env: Env;
let db: Db;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
  env = {
    DB: db.d1,
    BOT_NAME: "TestBot",
    BUSINESS_NAME: "Negocio",
    BOT_LANGUAGE: "es",
    BUFFER_SECONDS: "8",
    DASHBOARD_PASSWORD: PASSWORD,
    LICENSE_PUBLIC_KEY: testLicense.pub,
  } as unknown as Env;
  await new SettingsRepo(db).set(SETTING_KEYS.proLicense, testLicense.code);

  const audit = new AuditRepo(db);
  await audit.log({
    action: "settings.update",
    at: 3000,
    target: "tone",
    targetLabel: "Tono del bot",
    beforeVal: "cálido",
    afterVal: "formal",
    actorIpHash: "abc123def456",
    actorUa: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
    method: "POST",
  });
  await audit.log({
    action: "settings.update",
    at: 2000,
    target: "zernio_api_key",
    targetLabel: "API key de Zernio",
    beforeVal: "[vacío]",
    afterVal: "[secreto · termina en …9999]",
    actorIpHash: "abc123def456",
  });
  await audit.log({ action: "login.ok", at: 1000, result: "ok", actorIpHash: "zzz999", actorName: "admin" });
});

describe("renderAuditoria", () => {
  it("muestra las filas, el antes → después y NO filtra por defecto", async () => {
    const html = await renderAuditoria(env);
    expect(html).toContain("Registro de auditoría");
    expect(html).toContain("Tono del bot");
    expect(html).toContain("cálido");
    expect(html).toContain("formal");
    expect(html).toContain("Inició sesión");
    expect(html).toContain("solo lectura");
  });

  it("nunca muestra un secreto en claro", async () => {
    const html = await renderAuditoria(env);
    expect(html).toContain("[secreto · termina en …9999]");
    expect(html).not.toContain("SUPERSECRET");
  });

  it("filtra por acción y por texto", async () => {
    const soloLogin = await renderAuditoria(env, { action: "login.ok" });
    expect(soloLogin).toContain("Inició sesión");
    expect(soloLogin).not.toContain("Tono del bot");

    const soloZernio = await renderAuditoria(env, { text: "Zernio" });
    expect(soloZernio).toContain("API key de Zernio");
    expect(soloZernio).not.toContain("Tono del bot");
  });
});

describe("exportAuditCsv", () => {
  it("arma un CSV con cabecera y una línea por fila", async () => {
    const csv = await exportAuditCsv(env);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("fecha,actor,ip_hash,navegador,accion,metodo,ruta,objetivo,antes,despues,resultado");
    expect(lines).toHaveLength(4); // cabecera + 3 filas
    expect(csv).toContain("settings.update");
    expect(csv).not.toContain("SUPERSECRET");
  });
});

describe("rutas /admin/auditoria", () => {
  it("GET responde 200 y renderiza la tabla", async () => {
    const res = await adminApp.request("/auditoria", { headers: authHeader() }, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Registro de auditoría");
  });

  it("no existe ninguna ruta que escriba el registro (POST → 404)", async () => {
    const res = await adminApp.request("/auditoria", { method: "POST", headers: authHeader() }, env);
    expect(res.status).toBe(404);
  });

  it("export.csv responde con Content-Disposition de descarga", async () => {
    const res = await adminApp.request("/auditoria/export.csv", { headers: authHeader() }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
  });
});

describe("gating Pro de la vista Auditoría", () => {
  it("está declarada como tab Pro y como módulo vendible", () => {
    expect(PRO_ONLY_TABS).toContain("auditoria");
    expect(PAID_MODULES.some((m) => m.id === "auditoria" && m.tab === "auditoria")).toBe(true);
  });

  it("free: el ítem de nav Auditoría sale bloqueado (apunta a /admin/upgrade)", async () => {
    const freeEnv = { DB: makeDb({}) } as unknown as Env;
    const html = await layout({ title: "T", activeTab: "overview", body: "x", env: freeEnv });
    expect(html).not.toContain('href="/admin/auditoria"');
    expect(html).toContain("Auditoría"); // el label sigue visible, pero bloqueado
  });

  it("pro: el ítem de nav Auditoría linkea a su vista real", async () => {
    const proEnv = {
      DB: makeDb({ pro_license: testLicense.code }),
      LICENSE_PUBLIC_KEY: testLicense.pub,
    } as unknown as Env;
    const html = await layout({ title: "T", activeTab: "overview", body: "x", env: proEnv });
    expect(html).toContain('href="/admin/auditoria"');
  });
});

describe("captura de acciones que no pasan por settings (U3)", () => {
  it("POST /leads/:id/status deja una fila lead.status", async () => {
    const { LeadsRepo } = await import("../../src/db/leads");
    const leadId = await new LeadsRepo(db).create({
      conversationId: null,
      channelUserId: null,
      intent: "compra",
      name: "Ana",
    });

    const res = await adminApp.request(
      `/leads/${leadId}/status`,
      {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
        body: "status=sold",
      },
      env,
    );
    expect(res.status).toBe(302);
    const [row] = await new AuditRepo(db).list({ action: "lead.status" });
    expect(row?.target).toBe(`lead:${leadId}`);
    expect(row?.afterVal).toBe("sold");
  });

  it("POST /automatizaciones/:id/toggle deja una fila rule.toggle con antes→después", async () => {
    const { AutoRulesRepo } = await import("../../src/db/autoRules");
    const rules = new AutoRulesRepo(db);
    const rule = await rules.create({ kind: "dm_reply", keywords: ["precio"], message: "Te paso el catálogo" } as never);

    const res = await adminApp.request(
      `/automatizaciones/${rule.id}/toggle`,
      { method: "POST", headers: authHeader() },
      env,
    );
    expect(res.status).toBe(302);
    const [row] = await new AuditRepo(db).list({ action: "rule.toggle" });
    expect(row?.beforeVal).toBe("activa");
    expect(row?.afterVal).toBe("inactiva");
  });
});

describe("SettingsRepo.set dentro de un request del panel", () => {
  it("el cambio queda en el registro y se ve en la ventana", async () => {
    await runWithActor({ name: "admin", ipHash: "operador1", method: "POST", path: "/admin/config" }, async () => {
      await new SettingsRepo(db).set(SETTING_KEYS.botName, "Pelusa");
    });
    const html = await renderAuditoria(env, { text: "Pelusa" });
    expect(html).toContain("Nombre del bot");
    expect(html).toContain("Pelusa");
    expect(html).toContain("operador1".slice(-6));
  });
});
