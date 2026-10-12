// Juez del Laboratorio: puntúa una conversación (o una respuesta suelta) contra
// la rúbrica del escenario, con un modelo LLM. Los helpers de parsing/scoring son
// PUROS y se comparten con el CLI de evaluación (`pnpm eval`); el juez del panel
// corre dentro del Worker con el modelo configurado (BYO-LLM).
import { generateText } from "ai";
import type { Env } from "../env";
import { createModel } from "../llm/provider";
import { loadLlmOverrides } from "../settings-loader";

export const DEFAULT_THRESHOLD = 0.85;
/** Modelo juez por defecto en el CLI (Sonnet evalúa lo que produjo Haiku). */
export const JUDGE_MODEL = "claude-sonnet-4-5-20250929";

export interface EvalFixture {
  id: string;
  userMessage: string;
  rubric: string;
  expectedToolCall?: string | null;
}

export interface JudgeVerdict {
  passed: boolean;
  reason: string;
}

export interface EvalResult {
  id: string;
  passed: boolean;
  reason: string;
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number; // 0..1
  meetsThreshold: boolean;
  threshold: number;
  results: EvalResult[];
}

/**
 * Parsea la salida del juez a un veredicto estructurado. Fail-closed: si no hay
 * un JSON válido con un boolean `passed`, se cuenta como FALLO (un veredicto
 * ilegible no debe pasar).
 */
export function parseJudgeVerdict(raw: string): JudgeVerdict {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { passed: false, reason: "Judge devolvió respuesta vacía." };
  }
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { passed: false, reason: "Judge no devolvió JSON parseable." };
  let obj: unknown;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return { passed: false, reason: "Judge devolvió JSON inválido." };
  }
  if (obj === null || typeof obj !== "object") {
    return { passed: false, reason: "Judge devolvió un JSON no-objeto." };
  }
  const record = obj as Record<string, unknown>;
  if (typeof record.passed !== "boolean") {
    return { passed: false, reason: "Judge omitió el campo booleano 'passed'." };
  }
  const reason =
    typeof record.reason === "string" && record.reason.trim() !== ""
      ? record.reason.trim()
      : "(sin razón)";
  return { passed: record.passed, reason };
}

/** Agrega resultados individuales en un resumen con pass-rate y umbral. */
export function scoreResults(
  results: EvalResult[],
  threshold: number = DEFAULT_THRESHOLD,
): EvalSummary {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const passRate = total === 0 ? 0 : passed / total;
  return {
    total,
    passed,
    failed,
    passRate,
    threshold,
    meetsThreshold: total > 0 && passRate >= threshold,
    results,
  };
}

/** Prompt del juez para un fixture de UN mensaje (lo usa el CLI). */
export function buildJudgePrompt(fix: EvalFixture, botReply: string): string {
  return [
    `Escenario: ${fix.id}`,
    `El usuario escribió: "${fix.userMessage}"`,
    `Rúbrica de aprobación: ${fix.rubric}`,
    `Herramienta esperada: ${fix.expectedToolCall ?? "ninguna"}`,
    "",
    "Respuesta del bot:",
    `"""${botReply}"""`,
    "",
    "¿La respuesta del bot cumple la rúbrica? Responde SOLO con un objeto JSON:",
    `{"passed": <true|false>, "reason": "<una oración>"}`,
  ].join("\n");
}

export interface JudgeScenario {
  id: string;
  rubric: string;
  expectedToolCall?: string | null;
}

/** Prompt del juez para una CONVERSACIÓN (escenario rápido o persona). */
export function buildTranscriptJudgePrompt(
  scenario: JudgeScenario,
  transcript: { role: "user" | "assistant"; content: string }[],
): string {
  const convo = transcript
    .map((m) => `${m.role === "user" ? "CLIENTE" : "NEGOCIO"}: ${m.content}`)
    .join("\n");
  return [
    `Escenario: ${scenario.id}`,
    `Rúbrica de aprobación: ${scenario.rubric}`,
    `Herramienta esperada: ${scenario.expectedToolCall ?? "ninguna"}`,
    "",
    "Conversación (cliente ↔ negocio):",
    convo || "(vacía)",
    "",
    "¿La conversación cumple la rúbrica? Responde SOLO con un objeto JSON:",
    `{"passed": <true|false>, "reason": "<una oración>"}`,
  ].join("\n");
}

/** Renderiza un reporte legible del resumen. */
export function summarize(summary: EvalSummary): string {
  const lines: string[] = [];
  for (const r of summary.results) {
    lines.push(`  ${r.passed ? "✓" : "✗"} ${r.id} — ${r.reason}`);
  }
  lines.push("");
  lines.push(
    `${summary.passed}/${summary.total} aprobados ` +
      `(${(summary.passRate * 100).toFixed(0)}%) — ` +
      `umbral ${(summary.threshold * 100).toFixed(0)}% — ` +
      `${summary.meetsThreshold ? "PASS ✅" : "FAIL ❌"}`,
  );
  return lines.join("\n");
}

/**
 * Juez in-worker: puntúa una conversación con el modelo configurado (tier smart).
 * `judgeModelId` (opcional) permite forzar un modelo (setting `lab_judge_model`).
 */
export async function judgeTranscript(
  env: Env,
  scenario: JudgeScenario,
  transcript: { role: "user" | "assistant"; content: string }[],
  judgeModelId?: string,
): Promise<JudgeVerdict> {
  const ov = await loadLlmOverrides(env);
  const { model } = createModel(env, "smart", judgeModelId ? { ...ov, model: judgeModelId } : ov);
  const { text } = await generateText({
    model,
    maxOutputTokens: 300,
    prompt: buildTranscriptJudgePrompt(scenario, transcript),
  });
  return parseJudgeVerdict(text);
}
