import { describe, it, expect, vi } from "vitest";
import { searchKbTool } from "../../src/tools/searchKb";

describe("searchKbTool", () => {
  it("returns top-k chunks with scores", async () => {
    const fakeEnv = {
      AI: { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) },
      KB: { query: vi.fn(async () => ({ matches: [
        { id: "c1", score: 0.91, metadata: { title: "Embebar wall", content: "Pega <div data-tv-wall>...</div>" } },
        { id: "c2", score: 0.78, metadata: { title: "Generar carrusel", content: "Ir a Distribuir..." } },
      ] })) },
    } as any;
    const tool = searchKbTool(fakeEnv);
    const execute = tool.execute as (input: { query: string }) => Promise<any>;
    const result = await execute({ query: "como embebo wall" });
    expect(result.results).toHaveLength(2);
    expect(result.results[0].title).toBe("Embebar wall");
    expect(result.results[0].score).toBe(0.91);
  });

  it("returns empty results when KB throws", async () => {
    const fakeEnv = {
      AI: { run: vi.fn(async () => ({ data: [[0.1, 0.2]] })) },
      KB: { query: vi.fn(async () => { throw new Error("boom"); }) },
    } as any;
    const tool = searchKbTool(fakeEnv);
    const execute = tool.execute as (input: { query: string }) => Promise<any>;
    const result = await execute({ query: "x" });
    expect(result.error).toBe("transient");
  });

  it("drops hits below the default min score (0.45)", async () => {
    const fakeEnv = {
      AI: { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) },
      KB: { query: vi.fn(async () => ({ matches: [
        { id: "a", score: 0.62, metadata: { title: "Inventario", content: "Kia Sorento $14,900" } },
        { id: "b", score: 0.30, metadata: { title: "Ruido", content: "otra cosa" } },
      ] })) },
      // sin DB => resolveKbMinScore usa el default 0.45
    } as any;
    const tool = searchKbTool(fakeEnv);
    const execute = tool.execute as (input: { query: string }) => Promise<any>;
    const result = await execute({ query: "kia usado barato" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Inventario");
  });

  it("returns [] when every hit is below the min score", async () => {
    const fakeEnv = {
      AI: { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) },
      KB: { query: vi.fn(async () => ({ matches: [
        { id: "a", score: 0.31, metadata: { title: "x", content: "x" } },
        { id: "b", score: 0.12, metadata: { title: "y", content: "y" } },
      ] })) },
    } as any;
    const tool = searchKbTool(fakeEnv);
    const execute = tool.execute as (input: { query: string }) => Promise<any>;
    const result = await execute({ query: "algo que la KB no cubre" });
    expect(result.results).toEqual([]);
  });
});
