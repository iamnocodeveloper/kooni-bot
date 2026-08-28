import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildNightlyReportData,
  formatNightlyReport,
  sendNightlyReport,
  sendReportTest,
  reportDateLabel,
} from "../../src/reports/nightly";
import type { Env } from "../../src/env";

afterEach(() => vi.restoreAllMocks());

/** Stub D1 en memoria para las consultas del reporte. */
function makeDbStub(overrides: Partial<Record<string, unknown>> = {}, settings: Record<string, string> = {}) {
  const data = {
    clientes: { n: 14 },
    leads: { n: 4 },
    ventas: [
      { display_name: "Paola R.", channel_user_id: null, summary: "Pidió precios del paquete de novia." },
      { display_name: "Karen T.", channel_user_id: null, summary: "Quiere balayage el sábado." },
    ],
    molestos: [
      { display_name: "Don Raúl", channel_user_id: null, summary: "Su cita se recorrió 20 min.", sentiment: "frustrated" },
    ],
    tickets: { n: 1 },
    topics: [{ topics: JSON.stringify(["precios", "citas", "precios"]) }, { topics: JSON.stringify(["citas"]) }],
    ...overrides,
  };
  const resultsBySql: Array<[RegExp, unknown]> = [
    [/COUNT\(DISTINCT c\.id\) as n FROM conversations/, data.clientes],
    [/COUNT\(\*\) as n FROM leads/, data.leads],
    [/sale_opportunity = 1/, data.ventas],
    [/sentiment IN \('frustrated', 'angry'\)/, data.molestos],
    [/FROM tickets/, data.tickets],
    [/SELECT topics FROM conversation_insights/, data.topics],
  ];
  const self = {
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/SELECT value FROM settings WHERE key = \?/.test(sql)) {
        const v = settings[params[0] as string];
        return (v !== undefined ? { value: v } : null) as T;
      }
      const hit = resultsBySql.find(([re]) => re.test(sql));
      return (hit ? hit[1] : null) as T;
    },
    async all<T = unknown>(sql: string): Promise<T[]> {
      const hit = resultsBySql.find(([re]) => re.test(sql));
      return ((hit ? hit[1] : []) as unknown[]) as T[];
    },
    async run(): Promise<{ meta: { changes: number } }> {
      return { meta: { changes: 0 } };
    },
  };
  return {
    prepare(sql: string) {
      return {
        bind(..._params: unknown[]) {
          return {
            run: () => self.run(),
            first: () => self.first(sql, _params),
            all: () => self.all(sql).then((rows) => ({ results: rows })),
          };
        },
      };
    },
  } as unknown as import("@cloudflare/workers-types").D1Database;
}

function envWith(db: unknown, extra: Partial<Env> = {}): Env {
  return {
    DB: db as never,
    BUSINESS_NAME: "Salón Marcela",
    BOT_LANGUAGE: "es",
    LICENSE_MASTER_KEY: "test-master",
    BOT_INSTANCE_ID: "abc123",
    ...extra,
  } as unknown as Env;
}

/** Env con el módulo nightly_report desbloqueado (override del dueño). */
function envWithReportUnlocked(extra: Partial<Env> = {}): Env {
  return envWith(makeDbStub({}, { module_unlocks: JSON.stringify(["nightly_report"]) }), extra);
}

describe("buildNightlyReportData", () => {
  it("agrega los números del día desde D1", async () => {
    const data = await buildNightlyReportData(envWith(makeDbStub()), 1_800_000_000_000);
    expect(data.clientesAtendidos).toBe(14);
    expect(data.leadsNuevos).toBe(4);
    expect(data.ventasCalientes).toHaveLength(2);
    expect(data.ventasCalientes[0]).toEqual({ nombre: "Paola R.", resumen: "Pidió precios del paquete de novia." });
    expect(data.clientesMolestos).toHaveLength(1);
    expect(data.clientesMolestos[0].nombre).toBe("Don Raúl");
    expect(data.ticketsAbiertos).toBe(1);
    expect(data.temas).toEqual([
      { tema: "precios", n: 2 },
      { tema: "citas", n: 2 },
    ]);
  });

  it("tolera tablas vacías (día sin actividad)", async () => {
    const data = await buildNightlyReportData(
      envWith(
        makeDbStub({ clientes: { n: 0 }, leads: { n: 0 }, ventas: [], molestos: [], tickets: { n: 0 }, topics: [] }),
      ),
      1_800_000_000_000,
    );
    expect(data.clientesAtendidos).toBe(0);
    expect(data.ventasCalientes).toHaveLength(0);
    expect(data.clientesMolestos).toHaveLength(0);
    expect(data.temas).toHaveLength(0);
  });
});

describe("formatNightlyReport", () => {
  it("formatea el resumen estilo Forja+", () => {
    const data = {
      clientesAtendidos: 14,
      leadsNuevos: 4,
      ventasCalientes: [
        { nombre: "Paola R.", resumen: "Pidió precios del paquete de novia." },
        { nombre: "Karen T.", resumen: "Quiere balayage el sábado." },
      ],
      clientesMolestos: [{ nombre: "Don Raúl", resumen: "Su cita se recorrió 20 min.", sentimiento: "frustrated" }],
      ticketsAbiertos: 1,
      temas: [{ tema: "citas", n: 2 }],
      desde: 0,
      hasta: 0,
    };
    const text = formatNightlyReport(data, "Salón Marcela");
    expect(text).toContain("🌙 Resumen de hoy — Salón Marcela");
    expect(text).toContain("👥 14 clientes atendidos");
    expect(text).toContain("✨ 4 leads nuevos");
    expect(text).toContain("🔥 2 ventas calientes");
    expect(text).toContain("• Paola R. — Pidió precios del paquete de novia.");
    expect(text).toContain("😤 1 cliente molesto");
    expect(text).toContain("• Don Raúl — Su cita se recorrió 20 min.");
    expect(text).toContain("🎫 1 ticket abierto");
  });

  it("singulariza los contadores", () => {
    const text = formatNightlyReport(
      { clientesAtendidos: 1, leadsNuevos: 1, ventasCalientes: [], clientesMolestos: [], ticketsAbiertos: 0, temas: [], desde: 0, hasta: 0 },
      "X",
    );
    expect(text).toContain("👥 1 cliente atendido");
    expect(text).toContain("✨ 1 lead nuevo");
  });
});

describe("sendNightlyReport / sendReportTest", () => {
  it("no envía si el reporte está apagado", async () => {
    const res = await sendNightlyReport(envWith(makeDbStub(), { TELEGRAM_BOT_TOKEN: "t", OWNER_TELEGRAM_CHAT_ID: "1" }), 1_800_000_000_000);
    expect(res.reason).toBe("disabled");
  });

  it("envía por Telegram cuando está activado", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendReportTest(
      envWithReportUnlocked({ TELEGRAM_BOT_TOKEN: "token123", OWNER_TELEGRAM_CHAT_ID: "12345" }),
      1_800_000_000_000,
    );
    expect(res.sentTo).toContain("telegram");
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("api.telegram.org"));
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.chat_id).toBe("12345");
    expect(body.text).toContain("🌙 Resumen de hoy — Salón Marcela");
  });

  it("no envía por Telegram sin chat del dueño", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendReportTest(envWithReportUnlocked({}), 1_800_000_000_000);
    expect(res.sentTo).not.toContain("telegram");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no envía si el módulo nightly_report está bloqueado (gate de pago)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendReportTest(
      envWith(makeDbStub({}), { TELEGRAM_BOT_TOKEN: "t", OWNER_TELEGRAM_CHAT_ID: "1" }),
      1_800_000_000_000,
    );
    expect(res.reason).toBe("module_locked");
    expect(res.sentTo).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reportDateLabel", () => {
  it("devuelve una fecha legible", () => {
    const label = reportDateLabel(1_800_000_000_000, "es");
    expect(label.length).toBeGreaterThan(0);
  });
});
