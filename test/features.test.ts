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
    BOT_INSTANCE_ID: "abc123",
    ...extra,
  } as unknown as Env;
}

// MODELO (2026-09-07): sin paywall por módulo — `unlocked` es SIEMPRE true.
// Lo único que activa/desactiva una función Extra es su toggle del dueño.
const UNLOCKED = {};

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

  it("unlocked es siempre true (sin paywall por módulo)", async () => {
    const st = await extrasState(env({}), { feature_blindaje_enabled: "1" });
    expect(st.blindaje.on).toBe(true);
    expect(st.blindaje.unlocked).toBe(true);
    const st2 = await extrasState(env({}), {});
    expect(st2.vigilante.unlocked).toBe(true);
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

  it("toggle off → la función no actúa (aunque no haya paywall)", async () => {
    const r = await extrasForAgent(env({}), {});
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
  it("true con el toggle on; false con el toggle off", async () => {
    expect(await isFeatureActive(env({}), "cazador", { feature_cazador_enabled: "1" })).toBe(true);
    expect(await isFeatureActive(env({}), "cazador", {})).toBe(false);
    expect(await isFeatureActive(env({}), "no_existe", {})).toBe(false);
  });
});
