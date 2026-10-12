import { describe, it, expect } from "vitest";
import { computeDelta } from "../../src/lab/delta";

const R = (id: string, passed: boolean, category = "faq") => ({ scenario_id: id, passed, category });

describe("computeDelta", () => {
  it("calcula el pass-rate y su delta", () => {
    const prev = [R("a", true), R("b", true), R("c", false), R("d", false)];
    const curr = [R("a", true), R("b", true), R("c", true), R("d", false)];
    const d = computeDelta(prev, curr);
    expect(d.prevPassRate).toBe(0.5);
    expect(d.currPassRate).toBe(0.75);
    expect(d.passRateDelta).toBeCloseTo(0.25);
  });

  it("marca los que se rompieron y los que se arreglaron", () => {
    const prev = [R("a", true), R("b", false)];
    const curr = [R("a", false), R("b", true)];
    const d = computeDelta(prev, curr);
    expect(d.broke).toEqual(["a"]);
    expect(d.fixed).toEqual(["b"]);
  });

  it("un escenario nuevo no cuenta como rotura ni arreglo", () => {
    const prev = [R("a", true)];
    const curr = [R("a", true), R("b", true), R("c", false)];
    const d = computeDelta(prev, curr);
    expect(d.broke).toEqual([]);
    expect(d.fixed).toEqual([]);
  });

  it("desglosa por categoría", () => {
    const prev = [R("a", true, "faq"), R("b", false, "handoff")];
    const curr = [R("a", true, "faq"), R("b", true, "handoff")];
    const d = computeDelta(prev, curr);
    const handoff = d.byCategory.find((c) => c.category === "handoff");
    expect(handoff?.prev).toBe(0);
    expect(handoff?.curr).toBe(1);
    expect(handoff?.delta).toBe(1);
  });

  it("corridas vacías no revientan", () => {
    const d = computeDelta([], []);
    expect(d.passRateDelta).toBe(0);
    expect(d.broke).toEqual([]);
  });
});
