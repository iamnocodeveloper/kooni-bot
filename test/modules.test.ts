import { describe, it, expect } from "vitest";
import { unlockedModules, isModuleUnlocked, PAID_MODULES } from "../src/modules";
import { generateLicense } from "../src/license";
import type { Env } from "../src/env";
import type { D1Database } from "@cloudflare/workers-types";

const MASTER = "test-master-key";

/** Stub D1 en memoria con la tabla settings. */
function makeDb(settings: Record<string, string>): D1Database {
  const self = {
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/SELECT value FROM settings WHERE key = \?/.test(sql)) {
        const v = settings[params[0] as string];
        return (v !== undefined ? { value: v } : null) as T;
      }
      return null;
    },
    async all<T = unknown>(sql?: string): Promise<T[]> {
      if (sql && /FROM settings/.test(sql)) {
        return Object.entries(settings).map(([key, value]) => ({ key, value })) as T[];
      }
      return [] as T[];
    },
    async run(): Promise<{ meta: { changes: number } }> {
      return { meta: { changes: 0 } };
    },
  };
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            run: () => self.run(),
            first: () => self.first(sql, params),
            all: () => self.all(sql).then((rows) => ({ results: rows })),
          };
        },
      };
    },
  } as unknown as D1Database;
}

function env(settings: Record<string, string>, extra: Partial<Env> = {}): Env {
  return {
    DB: makeDb(settings) as never,
    LICENSE_MASTER_KEY: MASTER,
    BOT_INSTANCE_ID: "abc123",
    ...extra,
  } as unknown as Env;
}

describe("unlockedModules", () => {
  it("free sin licencia ni override → sin módulos", async () => {
    expect((await unlockedModules(env({}))).size).toBe(0);
  });

  it("BOT_TIER=pro → todos los módulos", async () => {
    const mods = await unlockedModules(env({}, { BOT_TIER: "pro" }));
    expect(mods.size).toBe(PAID_MODULES.length);
  });

  it("licencia legada (sin modules) → todos los módulos", async () => {
    const code = generateLicense(MASTER, { kind: "lifetime" });
    const mods = await unlockedModules(env({ pro_license: code }));
    expect(mods.size).toBe(PAID_MODULES.length);
  });

  it("licencia con modules → solo los incluidos", async () => {
    const code = generateLicense(MASTER, { kind: "lifetime", modules: ["nightly_report"] });
    const mods = await unlockedModules(env({ pro_license: code }));
    expect(mods.has("nightly_report")).toBe(true);
    expect(mods.has("analista")).toBe(false);
  });

  it("override del dueño (module_unlocks) suma módulos", async () => {
    const mods = await unlockedModules(env({ module_unlocks: JSON.stringify(["nightly_report", "campanas"]) }));
    expect(mods.has("nightly_report")).toBe(true);
    expect(mods.has("campanas")).toBe(true);
    expect(mods.has("analista")).toBe(false);
  });

  it("override + licencia se suman", async () => {
    const code = generateLicense(MASTER, { kind: "monthly", expiry: Date.now() + 86_400_000, modules: ["analista"] });
    const mods = await unlockedModules(env({ pro_license: code, module_unlocks: JSON.stringify(["nightly_report"]) }));
    expect(mods.has("analista")).toBe(true);
    expect(mods.has("nightly_report")).toBe(true);
    expect(mods.has("metricas")).toBe(false);
  });

  it("licencia vencida → no desbloquea", async () => {
    const code = generateLicense(MASTER, { kind: "monthly", expiry: Date.now() - 1000, modules: ["analista"] });
    const mods = await unlockedModules(env({ pro_license: code }));
    expect(mods.size).toBe(0);
  });

  it("ignora ids desconocidos en el override y en la licencia", async () => {
    const code = generateLicense(MASTER, { kind: "lifetime", modules: ["no_existe"] });
    const mods = await unlockedModules(env({ pro_license: code, module_unlocks: JSON.stringify(["tampoco"]) }));
    expect(mods.size).toBe(0);
  });
});

describe("isModuleUnlocked", () => {
  it("módulo desconocido nunca se bloquea", async () => {
    expect(await isModuleUnlocked(env({}), "nada_que_ver" as never)).toBe(true);
  });

  it("módulo conocido bloqueado por default", async () => {
    expect(await isModuleUnlocked(env({}), "nightly_report")).toBe(false);
  });
});
