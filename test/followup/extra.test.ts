import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendReplyMock = vi.fn();
vi.mock("../../src/replies/sender", () => ({
  sendReplyCapped: (...a: unknown[]) => sendReplyMock(...a),
}));

import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { ConversationsRepo } from "../../src/db/conversations";
import { MessagesRepo } from "../../src/db/messages";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import { runFollowupExtra } from "../../src/followup/extra";
import type { Env } from "../../src/env";

let env: Env;
let db: Db;
let convs: ConversationsRepo;
let msgs: MessagesRepo;
const NOW = Date.now();
const DAY = 86_400_000;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  db = new Db(d1 as any);
  env = {
    DB: d1,
    BOT_NAME: "Ana",
    BUSINESS_NAME: "Negocio",
    BOT_LANGUAGE: "es",
    BOT_TIER: "pro",
    BUFFER_SECONDS: "8",
    MANYCHAT_API_KEY: "mc",
  } as unknown as Env;
  convs = new ConversationsRepo(db);
  msgs = new MessagesRepo(db);
  const s = new SettingsRepo(db);
  await s.set(SETTING_KEYS.seguimientoCustom, "1");
  await s.set(SETTING_KEYS.seguimientoMessage3, "Último aviso: sigo por acá.");
  sendReplyMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

async function seedStep2(userId: string, reAt: number): Promise<string> {
  const conv = await convs.getOrCreate("manychat", userId, `Lead ${userId}`);
  await msgs.append(conv.id, "user", "hola");
  await msgs.append(conv.id, "assistant", "respuesta");
  await convs.touchLastMessage(conv.id, reAt);
  await db.run("INSERT INTO reengagement_sends (conversation_id, sent_at) VALUES (?, ?)", [conv.id, reAt]);
  return conv.id;
}

describe("runFollowupExtra — tercer toque personalizado", () => {
  it("manda el mensaje 3 a los 5-10 días del toque 2", async () => {
    await seedStep2("u1", NOW - 6 * DAY);
    const r = await runFollowupExtra(env, { now: NOW });
    expect(r.sent).toBe(1);
    const chunks = (sendReplyMock.mock.calls[0] as unknown[])[2] as string[];
    expect(chunks[0]).toContain("Último aviso");
  });

  it("no lo repite (claim por conversación + step)", async () => {
    await seedStep2("u2", NOW - 6 * DAY);
    await runFollowupExtra(env, { now: NOW });
    const r2 = await runFollowupExtra(env, { now: NOW });
    expect(r2.sent).toBe(0);
    expect(sendReplyMock).toHaveBeenCalledTimes(1);
  });

  it("fuera de la ventana (2 días) no envía", async () => {
    await seedStep2("u3", NOW - 2 * DAY);
    const r = await runFollowupExtra(env, { now: NOW });
    expect(r.sent).toBe(0);
  });

  it("con el mensaje 3 vacío no envía", async () => {
    await new SettingsRepo(db).set(SETTING_KEYS.seguimientoMessage3, "");
    await seedStep2("u4", NOW - 6 * DAY);
    const r = await runFollowupExtra(env, { now: NOW });
    expect(r.sent).toBe(0);
    expect(sendReplyMock).not.toHaveBeenCalled();
  });
});
