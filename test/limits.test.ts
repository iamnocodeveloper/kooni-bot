import { describe, it, expect } from "vitest";
import {
  FREE_LIMITS,
  PRO_LIMITS,
  limitMessage,
  checkChannelLimit,
  channelLimitMessage,
} from "../src/limits";
import type { Env } from "../src/env";

// Env cuyo `getLimits` resuelve a FREE (sin licencia) o PRO (licencia mock).
function freeEnv(): Env {
  return {
    DB: { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }) }) },
  } as unknown as Env;
}

describe("FREE_LIMITS / PRO_LIMITS", () => {
  it("free tiene límites numéricos", () => {
    expect(FREE_LIMITS.maxContacts).toBe(50);
    expect(FREE_LIMITS.maxMessagesPerMonth).toBe(500);
    expect(FREE_LIMITS.maxChannels).toBe(2);
    expect(FREE_LIMITS.maxRules).toBe(5);
    expect(FREE_LIMITS.maxAutoDmsPerMonth).toBe(100);
    expect(FREE_LIMITS.maxTrackedLinks).toBe(3);
  });

  it("pro no tiene límites (null)", () => {
    expect(PRO_LIMITS.maxContacts).toBeNull();
    expect(PRO_LIMITS.maxMessagesPerMonth).toBeNull();
    expect(PRO_LIMITS.maxChannels).toBeNull();
    expect(PRO_LIMITS.maxRules).toBeNull();
  });

  it("limitMessage es amable y menciona el panel", () => {
    const msg = limitMessage("contacts", 50, 50);
    expect(msg).toContain("50/50");
    expect(msg.toLowerCase()).toContain("límite");
    expect(msg).toContain("Pro");
  });

  it("limitMessage cubre mensajes/mes", () => {
    const msg = limitMessage("messagesThisMonth", 500, 500);
    expect(msg).toContain("500/500");
    expect(msg.toLowerCase()).toContain("mensajes");
  });
});

describe("checkChannelLimit (plan gratis: 2 canales)", () => {
  it("permite conectar cuando hay 1 conectado", async () => {
    const chk = await checkChannelLimit(freeEnv(), 1);
    expect(chk.allowed).toBe(true);
    expect(chk.limit).toBe(2);
  });

  it("bloquea el 3.º canal (ya hay 2)", async () => {
    const chk = await checkChannelLimit(freeEnv(), 2);
    expect(chk.allowed).toBe(false);
  });

  it("no bloquea si el canal que se guarda YA estaba conectado", async () => {
    const chk = await checkChannelLimit(freeEnv(), 2, true);
    expect(chk.allowed).toBe(true);
  });

  it("channelLimitMessage menciona el tope y Pro", () => {
    const msg = channelLimitMessage(2);
    expect(msg).toContain("2");
    expect(msg).toContain("Pro");
  });
});
