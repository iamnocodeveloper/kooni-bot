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

const ALL_TOOLS = [
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
];

describe("buildTools", () => {
  it("registra el set completo de tools (mismas en free y pro — sin gate por feature)", async () => {
    const free = await buildTools(makeCtx("free"));
    expect(Object.keys(free).sort()).toEqual(ALL_TOOLS);
    expect(free.scheduleAppointment).toBeDefined();
    expect(free.reportQuery).toBeDefined();
    expect(free.registrarCalificacion).toBeDefined();
  });

  it("catalogQuery está disponible en todos los planes", async () => {
    const free = await buildTools(makeCtx("free"));
    expect(free.captureLead).toBeDefined();
    expect(free.catalogQuery).toBeDefined();

    const pro = await buildTools(makeCtx("pro"));
    expect(Object.keys(pro).sort()).toEqual(ALL_TOOLS);
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
