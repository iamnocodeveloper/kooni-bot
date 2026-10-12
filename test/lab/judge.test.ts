import { describe, it, expect } from "vitest";
import {
  parseJudgeVerdict,
  scoreResults,
  buildTranscriptJudgePrompt,
  DEFAULT_THRESHOLD,
} from "../../src/lab/judge";

describe("juez del Laboratorio — partes puras", () => {
  it("parseJudgeVerdict es fail-closed ante basura", () => {
    expect(parseJudgeVerdict("").passed).toBe(false);
    expect(parseJudgeVerdict("no hay json").passed).toBe(false);
    expect(parseJudgeVerdict('{"reason":"x"}').passed).toBe(false);
    expect(parseJudgeVerdict('{"passed": true, "reason": "ok"}')).toEqual({ passed: true, reason: "ok" });
  });

  it("scoreResults calcula pass-rate y umbral", () => {
    const s = scoreResults(
      [
        { id: "a", passed: true, reason: "" },
        { id: "b", passed: false, reason: "" },
      ],
      DEFAULT_THRESHOLD,
    );
    expect(s.passRate).toBe(0.5);
    expect(s.meetsThreshold).toBe(false);
  });

  it("buildTranscriptJudgePrompt incluye rúbrica y conversación", () => {
    const p = buildTranscriptJudgePrompt(
      { id: "persona-x", rubric: "Debe usar searchKb", expectedToolCall: "searchKb" },
      [
        { role: "user", content: "¿cuánto cuesta?" },
        { role: "assistant", content: "Dejame ver..." },
      ],
    );
    expect(p).toContain("persona-x");
    expect(p).toContain("Debe usar searchKb");
    expect(p).toContain("CLIENTE: ¿cuánto cuesta?");
    expect(p).toContain("NEGOCIO: Dejame ver...");
  });
});
