import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `agents` (partyserver) importa `cloudflare:workers` en load — se mockea igual
// que en test/agent.media.test.ts.
vi.mock("agents", () => ({
  Agent: class {
    ctx: any;
    env: any;
    state: any;
    constructor(ctx: any, env: any) {
      this.ctx = ctx;
      this.env = env;
    }
    setState(s: any) {
      this.state = s;
    }
    sql() {
      return undefined;
    }
  },
}));
vi.mock("ai", () => ({ streamText: vi.fn(), tool: (d: any) => d }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => (m: string) => ({ modelId: m }) }));

import { SupportAgent } from "../src/agent";
import { Db } from "../src/db/client";
import { SettingsRepo, SETTING_KEYS } from "../src/db/settings";
import { createTestMiniflare } from "./helpers/miniflareSetup";

let env: any;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  env = {
    DB: d1,
    BOT_NAME: "TestBot",
    BUSINESS_NAME: "TestCo",
    BOT_LANGUAGE: "es",
    BOT_TIER: "free",
    BUFFER_SECONDS: "8",
    ANTHROPIC_API_KEY: "sk-test",
    TELEGRAM_BOT_TOKEN: "tok",
  };
  const s = new SettingsRepo(new Db(d1 as any));
  await s.set(SETTING_KEYS.allowMultimedia, "1");
  await s.set(SETTING_KEYS.featureGaleria, "1");
  await s.set(SETTING_KEYS.moduleUnlocks, JSON.stringify(["galeria"]));
  await s.set(
    SETTING_KEYS.resourceLibrary,
    JSON.stringify({
      IMG1: { kind: "image", url: "https://x/i1.jpg", caption: "Bienvenido", firstMessage: true },
      IMG2: { kind: "image", url: "https://x/i2.jpg", firstMessage: true },
      NORMAL: { kind: "image", url: "https://x/n.jpg" },
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function makeAgent() {
  const storage = { setAlarm: vi.fn(), getAlarm: vi.fn() };
  const agent: any = new (SupportAgent as any)({ storage }, env);
  agent.setState({
    conversationId: "",
    channel: "telegram",
    channelUserId: "u1",
    pendingMessages: [],
    lastAlarmAt: 0,
    lastUserLang: "es",
    toolCallsInLast2Turns: 0,
    lastSearchKbScore: 1,
    imageRetryCount: 0,
  });
  return agent;
}

describe("ingest — recursos firstMessage (campañas)", () => {
  it("manda los recursos marcados en el PRIMER mensaje y no en el segundo", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        calls.push(String(url));
        return new Response("{}", { status: 200 });
      }),
    );

    const agent = makeAgent();
    await agent.ingest({ channel: "telegram", channelUserId: "u1", text: "hola" });
    await agent.ingest({ channel: "telegram", channelUserId: "u1", text: "hola otra vez" });

    // Solo IMG1 + IMG2 (no NORMAL), y solo en el primer mensaje.
    const photos = calls.filter((u) => u.includes("/sendPhoto"));
    expect(photos).toHaveLength(2);
  });

  it("no manda nada si el mensaje es del dueño", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        calls.push(String(url));
        return new Response("{}", { status: 200 });
      }),
    );
    const agent = makeAgent();
    await agent.ingest({ channel: "telegram", channelUserId: "u1", text: "hola", isOwnerMessage: true });
    expect(calls.filter((u) => u.includes("/sendPhoto"))).toHaveLength(0);
  });
});
