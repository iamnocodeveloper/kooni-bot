import { describe, it, expect } from "vitest";
import { buildTools, type ToolContext } from "../../src/tools/index";
import { makeDb, testLicense, proCode } from "../helpers/license";

function makeCtx(tier: "free" | "pro", calcom?: boolean): ToolContext {
  const env = {
    BOT_TIER: tier,
    DB: tier === "pro" ? (makeDb({ pro_license: proCode() }) as any) : ({} as any),
    LICENSE_PUBLIC_KEY: testLicense.pub,
    AI: {} as any,
    BUSINESS_NAME: "Test",
    OWNER_EMAIL: "owner@test.com",
    DASHBOARD_BASE_URL: "https://example.com",
    ...(calcom ? { CALCOM_API_KEY: "cal_test", CALCOM_EVENT_TYPE_ID: "123" } : {}),
  } as any;
  return { env, getConversationId: () => "conv-1" };
}

describe("buildTools", () => {
  it("registra las 9 tools base (scheduleAppointment siempre — evita alucinaciones)", async () => {
    const tools = await buildTools(makeCtx("free"));
    expect(Object.keys(tools).sort()).toEqual([
      "captureLead",
      "enviarRecurso",
      "handoffHuman",
      "pauseBot",
      "registrarCalificacion",
      "reportQuery",
      "scheduleAppointment",
      "searchKb",
      "snoozeUser",
    ]);
    expect(tools.scheduleAppointment).toBeDefined();
    expect(tools.reportQuery).toBeDefined();
    expect(tools.registrarCalificacion).toBeDefined();
  });

  it("free tier captura leads; pro agrega catálogo (Pro-only)", async () => {
    const free = await buildTools(makeCtx("free"));
    expect(free.captureLead).toBeDefined();
    expect(free.catalogQuery).toBeUndefined();

    const pro = await buildTools(makeCtx("pro"));
    expect(pro.catalogQuery).toBeDefined();
    expect(Object.keys(pro).sort()).toEqual([
      "captureLead",
      "catalogQuery",
      "enviarRecurso",
      "handoffHuman",
      "pauseBot",
      "registrarCalificacion",
      "reportQuery",
      "scheduleAppointment",
      "searchKb",
      "snoozeUser",
    ]);
  });

  it("el Starter genérico no agrega tools de nicho (aunque BOT_NICHE traiga un giro)", async () => {
    const tools = await buildTools(makeCtx("pro"));
    expect(tools.crearReservacion).toBeUndefined();
    expect(tools.calificarComprador).toBeUndefined();
    expect(tools.agendarCita).toBeUndefined();
    expect(tools.registrarPedido).toBeUndefined();
    expect(tools.registrarProspecto).toBeUndefined();
    expect(tools.reservarHospedaje).toBeUndefined();
  });
});
