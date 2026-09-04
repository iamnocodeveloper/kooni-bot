import { describe, it, expect, vi } from "vitest";
import { queryKb, resolveKbMinScore, KB_MIN_SCORE_DEFAULT } from "../../src/kb/query";
import type { Env } from "../../src/env";

describe("queryKb", () => {
  it("pide returnMetadata:'all' — sin esto Vectorize devuelve title/content vacíos aunque el score sea bueno (bug real, 2026-09-04: el bot decía 'no tengo información' con la KB llena)", async () => {
    const queryMock = vi.fn(async (_vec: number[], opts: unknown) => {
      // Simula el default real de Vectorize: sin returnMetadata pedido, la
      // metadata NO viene — exactamente el bug que causó esto.
      const wantsMetadata = (opts as { returnMetadata?: unknown })?.returnMetadata === "all";
      return {
        matches: [
          {
            score: 0.56,
            metadata: wantsMetadata ? { title: "Inventario", content: "Kia Sorento 2026 $33,216" } : undefined,
          },
        ],
      };
    });
    const env = {
      AI: { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) },
      KB: { query: queryMock },
    } as unknown as Env;

    const res = await queryKb(env, "que autos kia tienes");
    expect(queryMock).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ returnMetadata: "all" }));
    if ("error" in res) throw new Error("no debería fallar");
    expect(res.results).toHaveLength(1);
    expect(res.results[0].title).toBe("Inventario");
    expect(res.results[0].content).toContain("Kia Sorento");
    expect(res.results[0].score).toBe(0.56);
  });

  it("error transient si el embedding falla o Vectorize tira", async () => {
    const env = {
      AI: { run: vi.fn(async () => ({ data: [[0.1]] })) },
      KB: { query: vi.fn(async () => { throw new Error("boom"); }) },
    } as unknown as Env;
    const res = await queryKb(env, "x");
    expect("error" in res && res.error).toBe("transient");
  });
});

describe("resolveKbMinScore", () => {
  it("default 0.45 sin DB", async () => {
    expect(await resolveKbMinScore({} as Env)).toBe(KB_MIN_SCORE_DEFAULT);
  });
});
