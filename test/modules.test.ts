import { describe, it, expect } from "vitest";
import { unlockedModules, isModuleUnlocked, PAID_MODULES } from "../src/modules";
import type { Env } from "../src/env";

function env(extra: Partial<Env> = {}): Env {
  // DB vacío a propósito: sin D1, `unlockedModules` cae al modo legacy
  // (todo desbloqueado) — el comportamiento fail-open.
  return {
    DB: {} as never,
    BOT_INSTANCE_ID: "abc123",
    ...extra,
  } as unknown as Env;
}

// MODELO: sin `module_unlocks` seteado → TODO desbloqueado (retrocompat con las
// instalaciones viejas). Con `module_unlocks` presente → exactamente esos ids,
// que es lo que escribe el backend de licencias desde el super admin.
describe("unlockedModules — gating por licencia", () => {
  it("sin module_unlocks (legacy) → TODOS los módulos", async () => {
    const mods = await unlockedModules(env());
    expect(mods.size).toBe(PAID_MODULES.length);
  });

  it("con module_unlocks presente → exactamente esos ids", async () => {
    const mods = await unlockedModules(env(), { module_unlocks: JSON.stringify(["cazador", "resenas"]) });
    expect([...mods].sort()).toEqual(["cazador", "resenas"]);
  });

  it("array vacío → ninguno desbloqueado", async () => {
    const mods = await unlockedModules(env(), { module_unlocks: "[]" });
    expect(mods.size).toBe(0);
  });

  it("los ids desconocidos se filtran", async () => {
    const mods = await unlockedModules(env(), { module_unlocks: JSON.stringify(["cazador", "nada_que_ver"]) });
    expect([...mods]).toEqual(["cazador"]);
  });

  it("JSON inválido → todos (fail-open)", async () => {
    const mods = await unlockedModules(env(), { module_unlocks: "{no json" });
    expect(mods.size).toBe(PAID_MODULES.length);
  });

  it("cada id del catálogo está presente en el modo legacy", async () => {
    const mods = await unlockedModules(env());
    for (const m of PAID_MODULES) expect(mods.has(m.id)).toBe(true);
  });
});

describe("isModuleUnlocked", () => {
  it("módulo conocido → true (legacy: todo abierto)", async () => {
    expect(await isModuleUnlocked(env(), "nightly_report")).toBe(true);
  });

  it("módulo desconocido → false", async () => {
    expect(await isModuleUnlocked(env(), "nada_que_ver")).toBe(false);
  });
});
