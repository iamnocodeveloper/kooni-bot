import { describe, it, expect } from "vitest";
import {
  evalScenarios,
  quickScenarios,
  allScenarios,
  expectedTools,
} from "../../src/lab/scenarios";
import { personaScenarios } from "../../src/lab/personas";

describe("escenarios del Laboratorio", () => {
  it("quickScenarios() mapea los 20 escenarios con kind single y label", () => {
    const quick = quickScenarios();
    expect(quick).toHaveLength(20);
    expect(evalScenarios).toHaveLength(20);
    for (const s of quick) {
      expect(s.kind).toBe("single");
      expect(s.label).toBe(s.id);
      expect(typeof s.userMessage).toBe("string");
      expect((s.userMessage ?? "").length).toBeGreaterThan(0);
    }
  });

  it("personaScenarios() trae personas multi-turno con apertura y objetivo", () => {
    const personas = personaScenarios();
    expect(personas.length).toBeGreaterThanOrEqual(6);
    for (const p of personas) {
      expect(p.kind).toBe("persona");
      expect(p.category).toBe("persona");
      expect(p.persona?.opening.trim().length).toBeGreaterThan(0);
      expect(p.persona?.goal.trim().length).toBeGreaterThan(0);
      expect(p.rubric.trim().length).toBeGreaterThan(0);
      expect(p.maxTurns ?? p.persona?.maxTurns).toBeGreaterThan(0);
    }
  });

  it("allScenarios() une rápidos + personas sin ids duplicados", () => {
    const all = allScenarios();
    expect(all).toHaveLength(20 + personaScenarios().length);
    const ids = all.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("expone las tools núcleo esperadas", () => {
    expect(expectedTools).toContain("searchKb");
    expect(expectedTools).toContain("captureLead");
    expect(expectedTools).toContain("handoffHuman");
  });
});
