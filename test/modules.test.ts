import { describe, it, expect } from "vitest";
import { unlockedModules, isModuleUnlocked, PAID_MODULES } from "../src/modules";
import { generateLicenseV2 } from "../src/license";
import type { Env } from "../src/env";

const { generateKeyPairSync } = await import("node:crypto");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PRIV = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const PUB = publicKey.export({ format: "der", type: "spki" }).toString("base64");

function env(extra: Partial<Env> = {}): Env {
  return {
    DB: {} as never,
    LICENSE_PUBLIC_KEY: PUB,
    BOT_INSTANCE_ID: "abc123",
    ...extra,
  } as unknown as Env;
}

// MODELO (2026-09-07): no hay paywall por feature. `unlockedModules` /
// `isModuleUnlocked` devuelven SIEMPRE "todo desbloqueado", sin importar
// licencia ni settings. Lo que separa free de Pro son los límites de cantidad
// (ver test/limits.test.ts).
describe("unlockedModules — todo desbloqueado siempre", () => {
  it("free sin licencia → TODOS los módulos", async () => {
    const mods = await unlockedModules(env());
    expect(mods.size).toBe(PAID_MODULES.length);
  });

  it("con licencia legada → TODOS los módulos", async () => {
    const code = generateLicenseV2(PRIV, { kind: "lifetime" });
    const mods = await unlockedModules(env({ pro_license: code } as Partial<Env>));
    expect(mods.size).toBe(PAID_MODULES.length);
  });

  it("cada id del catálogo está presente", async () => {
    const mods = await unlockedModules(env());
    for (const m of PAID_MODULES) expect(mods.has(m.id)).toBe(true);
  });
});

describe("isModuleUnlocked — siempre true", () => {
  it("módulo conocido → true", async () => {
    expect(await isModuleUnlocked(env(), "nightly_report")).toBe(true);
  });

  it("módulo desconocido → true", async () => {
    expect(await isModuleUnlocked(env(), "nada_que_ver")).toBe(true);
  });
});
