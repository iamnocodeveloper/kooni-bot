import { describe, it, expect } from "vitest";
import {
  extrasState,
  extrasForAgent,
  isFeatureActive,
  BLINDAJE_PROMPT_BLOCK,
  HANDOFF_PROMPT_BLOCK,
  VOZ_MARCA_PROMPT_BLOCK,
  MULTIIDIOMA_PROMPT_BLOCK,
  ENCUESTAS_PROMPT_BLOCK,
} from "../src/features";
import type { Env } from "../src/env";
import type { D1Database } from "@cloudflare/workers-types";

function makeDb(settings: Record<string, string>): D1Database {
  const self = {
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/SELECT value FROM settings WHERE key = \?/.test(sql)) {
        const v = settings[params[0] as string];
        return (v !== undefined ? { value: v } : null) as T;
      }
      return null;
    },
    async all<T = unknown>(_sql?: string): Promise<T[]> {
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
    LICENSE_MASTER_KEY: "test-master",
    BOT_INSTANCE_ID: "abc123",
    ...extra,
  } as unknown as Env;
}

const UNLOCKED = { module_unlocks: JSON.stringify(["blindaje", "vigilante", "handoff_smart", "cazador", "oido_vista", "voz_marca", "multiidioma", "encuestas"]) };

const FEATURES_ON = {
  feature_blindaje_enabled: "1",
  feature_vigilante_enabled: "1",
  feature_handoff_enabled: "1",
  feature_cazador_enabled: "1",
  feature_oido_vista_enabled: "1",
  feature_voz_marca_enabled: "1",
  feature_multiidioma_enabled: "1",
  feature_encuestas_enabled: "1",
};

describe("extrasState", () => {
  it("toggle off → on=false", async () => {
    const st = await extrasState(env({}), { ...UNLOCKED });
    expect(st.blindaje.on).toBe(false);
    expect(st.blindaje.unlocked).toBe(true);
  });

  it("toggle on + módulo desbloqueado → on y unlocked", async () => {
    const st = await extrasState(env({}), { ...UNLOCKED, feature_blindaje_enabled: "1" });
    expect(st.blindaje.on).toBe(true);
    expect(st.blindaje.unlocked).toBe(true);
  });

  it("toggle on pero módulo bloqueado → on=true, unlocked=false (el panel lo muestra 🔒 y la función no actúa)", async () => {
    const st = await extrasState(env({}), { feature_blindaje_enabled: "1" });
    expect(st.blindaje.on).toBe(true);
    expect(st.blindaje.unlocked).toBe(false);
  });
});

describe("extrasForAgent", () => {
  it("blindaje on + módulo → inyecta el bloque al prompt", async () => {
    const { extraInstructions } = await extrasForAgent(env({}), {
      ...UNLOCKED,
      feature_blindaje_enabled: "1",
    });
    expect(extraInstructions.join(" ")).toContain("BLINDAJE");
    expect(extraInstructions.some((b) => b.includes(BLINDAJE_PROMPT_BLOCK.slice(0, 40)))).toBe(true);
  });

  it("handoff on + módulo → inyecta su bloque", async () => {
    const { extraInstructions } = await extrasForAgent(env({}), {
      ...UNLOCKED,
      feature_handoff_enabled: "1",
    });
    expect(extraInstructions.some((b) => b.includes(HANDOFF_PROMPT_BLOCK.slice(0, 40)))).toBe(true);
  });

  it("vigilante on + módulo → vigilanteEnabled=true", async () => {
    const r = await extrasForAgent(env({}), {
      ...UNLOCKED,
      feature_vigilante_enabled: "1",
    });
    expect(r.vigilanteEnabled).toBe(true);
  });

  it("módulo bloqueado → la función no actúa aunque el toggle esté on", async () => {
    const r = await extrasForAgent(env({}), { feature_blindaje_enabled: "1", feature_vigilante_enabled: "1" });
    expect(r.extraInstructions).toHaveLength(0);
    expect(r.vigilanteEnabled).toBe(false);
  });

  it("inyecta los bloques de voz de marca, multi-idioma y encuestas", async () => {
    const r = await extrasForAgent(env({}), { ...UNLOCKED, ...FEATURES_ON });
    const all = r.extraInstructions.join(" ");
    expect(all).toContain(VOZ_MARCA_PROMPT_BLOCK.slice(0, 40));
    expect(all).toContain(MULTIIDIOMA_PROMPT_BLOCK.slice(0, 40));
    expect(all).toContain(ENCUESTAS_PROMPT_BLOCK.slice(0, 40));
  });

  it("oido_vista activo → oidoVistaEnabled=true", async () => {
    const r = await extrasForAgent(env({}), { ...UNLOCKED, feature_oido_vista_enabled: "1" });
    expect(r.oidoVistaEnabled).toBe(true);
  });
});

describe("isFeatureActive", () => {
  it("true solo con toggle on Y módulo desbloqueado", async () => {
    expect(await isFeatureActive(env({}), "cazador", { ...UNLOCKED, feature_cazador_enabled: "1" })).toBe(true);
    expect(await isFeatureActive(env({}), "cazador", { feature_cazador_enabled: "1" })).toBe(false);
    expect(await isFeatureActive(env({}), "cazador", { ...UNLOCKED })).toBe(false);
    expect(await isFeatureActive(env({}), "no_existe", {})).toBe(false);
  });
});
