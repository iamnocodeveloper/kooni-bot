import { describe, it, expect, vi, afterEach } from "vitest";

// Mock de "ai" (streamText) y de createModel — no queremos LLM real en el test.
const streamTextMock = vi.fn();
vi.mock("ai", () => ({
  streamText: (...a: unknown[]) => streamTextMock(...a),
  tool: (def: unknown) => def,
}));
vi.mock("../../src/llm/provider", () => ({
  createModel: () => ({ model: { modelId: "mock" }, modelId: "claude-sonnet-mock", provider: "anthropic" }),
}));

import { adminApp } from "../../src/admin/routes";
import type { Env } from "../../src/env";

afterEach(() => vi.restoreAllMocks());

const PW = "secret123";
const AUTH = { Authorization: `Basic ${Buffer.from(`admin:${PW}`).toString("base64")}` };

function makeEnv(): Env {
  return {
    DASHBOARD_PASSWORD: PW,
    BOT_NAME: "TestBot",
    BUSINESS_NAME: "Test Biz",
    BOT_LANGUAGE: "es",
    BOT_TIER: "pro",
    ANTHROPIC_API_KEY: "sk-test",
    AI: { run: vi.fn() },
    KB: { query: vi.fn(), upsert: vi.fn(), deleteByIds: vi.fn() },
    DB: {
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({ meta: {} }) }),
        all: async () => ({ results: [] }),
      }),
    },
  } as unknown as Env;
}

const req = (path: string, init?: RequestInit) =>
  new Request(`https://bot.test${path}`, { ...init, headers: { ...AUTH, ...(init?.headers ?? {}) } });

function stubStream(text: string, toolCalls: { toolName: string; input: unknown }[] = []) {
  async function* gen() { yield text; }
  streamTextMock.mockReturnValue({
    textStream: gen(),
    steps: Promise.resolve([{ toolCalls }]),
    usage: Promise.resolve({}),
  });
}

describe("Probar el bot", () => {
  it("GET /admin/probar renderiza el chat de prueba", async () => {
    const res = await adminApp.fetch(req("/probar"), makeEnv());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Probar el bot");
    expect(html).toContain("/admin/probar/send");
    expect(html).toContain("No se guarda nada");
  });

  it("POST /admin/probar/send corre un turno y devuelve reply + tools + model", async () => {
    stubStream("Tenemos un Kia Rio 2020 en $13,900.", [{ toolName: "searchKb", input: { query: "kia usado" } }]);
    const res = await adminApp.fetch(
      req("/probar/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "¿tienen un kia usado?", history: [] }),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { reply: string; toolCalls: { toolName: string }[]; model: string };
    expect(j.reply).toContain("Kia Rio");
    expect(j.toolCalls[0].toolName).toBe("searchKb");
    expect(j.model).toBe("claude-sonnet-mock");

    // Solo tools de lectura: el registro pasado a streamText no trae captureLead.
    const arg = streamTextMock.mock.calls[0][0] as { tools: Record<string, unknown>; system: { content: string }[] };
    expect(Object.keys(arg.tools)).not.toContain("captureLead");
    expect(Object.keys(arg.tools)).not.toContain("handoffHuman");
    expect(arg.system.some((s) => s.content.includes("modo_prueba"))).toBe(true);
  });

  it("POST /admin/probar/send sin texto → 400", async () => {
    const res = await adminApp.fetch(
      req("/probar/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});
