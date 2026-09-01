import { describe, it, expect, vi, afterEach } from "vitest";
import { runVigilanteCheck } from "../src/vigilante";
import type { Env } from "../src/env";
import type { D1Database } from "@cloudflare/workers-types";

afterEach(() => vi.restoreAllMocks());

/** Stub D1: messages (historial), conversations (nombre) y dm_logs (throttle + log). */
function makeDb(history: { role: string; content: string }[], alertedRecently = false) {
  const logs: any[] = [];
  const self = {
    async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (/FROM messages/.test(sql)) return history as T[];
      return [] as T[];
    },
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/SELECT COUNT\(\*\) as n FROM dm_logs WHERE kind = 'vigilante'/.test(sql)) {
        return { n: alertedRecently ? 1 : 0 } as T;
      }
      if (/SELECT display_name, channel_user_id FROM conversations/.test(sql)) {
        return { display_name: "María", channel_user_id: "maria.g" } as T;
      }
      return null;
    },
    async run(sql: string, params: unknown[] = []): Promise<{ meta: { changes: number } }> {
      if (/INSERT INTO dm_logs/.test(sql)) {
        logs.push({ kind: params[1], target: params[3] });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
  };
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            run: () => self.run(sql, params),
            first: () => self.first(sql, params),
            all: () => self.all(sql, params).then((rows) => ({ results: rows })),
          };
        },
      };
    },
  } as unknown as D1Database;
}

function env(extra: Partial<Env> = {}): Env {
  return {
    DB: makeDb([]) as never,
    BUSINESS_NAME: "Test",
    DASHBOARD_BASE_URL: "https://x.test",
    BOT_LANGUAGE: "es",
    TELEGRAM_BOT_TOKEN: "tok",
    OWNER_TELEGRAM_CHAT_ID: "1",
    RESEND_API_KEY: "",
    OWNER_EMAIL: "",
    ...extra,
  } as unknown as Env;
}

describe("runVigilanteCheck", () => {
  it("cliente molesto → avisa al dueño y registra el aviso", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const history = [
      { role: "user", content: "Hola, ¿cuánto cuesta el corte?" },
      { role: "assistant", content: "El corte está en $150." },
      { role: "user", content: "Estoy muy molesto con el servicio, quiero una queja" },
    ];
    const res = await runVigilanteCheck(env({ DB: makeDb(history) as never }), "conv_1");
    expect(res.signaled).toBe(true);
    expect(res.alerted).toBe(true);
    expect(res.reason).toContain("molesto");
    // notifyOwner → Telegram sendMessage
    const tgCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("api.telegram.org"));
    expect(tgCall).toBeTruthy();
  });

  it("venta en riesgo (cliente dudando) → avisa", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const history = [
      { role: "user", content: "Está caro, déjame lo pienso" },
    ];
    const res = await runVigilanteCheck(env({ DB: makeDb(history) as never }), "conv_1");
    expect(res.signaled).toBe(true);
    expect(res.reason).toContain("riesgo");
  });

  it("conversación normal → no avisa", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const history = [
      { role: "user", content: "Hola, ¿qué horarios tienen?" },
      { role: "assistant", content: "Lunes a sábado de 9 a 7." },
      { role: "user", content: "Perfecto, gracias" },
    ];
    const res = await runVigilanteCheck(env({ DB: makeDb(history) as never }), "conv_1");
    expect(res.signaled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throttle: no re-avisa en la misma conversación dentro de 6h", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const history = [{ role: "user", content: "Estoy enojado" }];
    const res = await runVigilanteCheck(env({ DB: makeDb(history, true) as never }), "conv_1");
    expect(res.signaled).toBe(true);
    expect(res.alerted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
