// Orquestación del Laboratorio: corre un set de escenarios contra el agente real
// (sandbox), los juzga, persiste el resultado de cada uno y cierra la corrida.
// Los fallos se proponen como Mejoras (KB) para cerrarlos con un clic.
import type { Env } from "../env";
import { Db } from "../db/client";
import { LabRepo, type LabRunKind } from "../db/lab";
import { SuggestionsRepo } from "../db/suggestions";
import { judgeTranscript } from "./judge";
import { runLabScenario } from "./runner";
import { allScenarios, type LabScenario } from "./scenarios";

export interface RunLabOptions {
  kind: LabRunKind;
  threshold?: number;
  judgeModel?: string;
  /** Tope de escenarios por corrida (guarda de costo/tiempo). */
  maxScenarios?: number;
}

export const DEFAULT_LAB_THRESHOLD = 0.85;
export const DEFAULT_LAB_MAX = 12;

function scenariosForKind(kind: LabRunKind): LabScenario[] {
  const all = allScenarios();
  return kind === "quick" ? all.filter((s) => s.kind === "single") : all.filter((s) => s.kind === "persona");
}

/**
 * Corre el Laboratorio para una corrida ya creada (`runId`). Secuencial a
 * propósito: persiste cada resultado al terminar, para que el panel muestre
 * progreso. Fail-open: un escenario que revienta no tumba la corrida.
 */
export async function runLab(env: Env, runId: string, opts: RunLabOptions): Promise<void> {
  const db = new Db(env.DB);
  const repo = new LabRepo(db);
  const threshold = opts.threshold ?? DEFAULT_LAB_THRESHOLD;
  const maxScenarios = opts.maxScenarios ?? DEFAULT_LAB_MAX;

  let scenarios = scenariosForKind(opts.kind);
  if (maxScenarios > 0) scenarios = scenarios.slice(0, maxScenarios);

  let passed = 0;
  let failed = 0;
  let cost = 0;
  const outcomes: { scenario: LabScenario; passed: boolean; reason: string }[] = [];

  try {
    for (const scenario of scenarios) {
      const started = Date.now();
      let reason = "Error inesperado.";
      let ok = false;
      let botText: string | null = null;
      let toolNames: string[] = [];
      let turns: number | null = null;

      try {
        const run = await runLabScenario(env, scenario);
        botText = run.reply || null;
        turns = run.turns;
        toolNames = run.toolCalls.map((t) => t.toolName);
        cost += run.cost;
        const verdict = await judgeTranscript(
          env,
          { id: scenario.id, rubric: scenario.rubric, expectedToolCall: scenario.expectedToolCall },
          run.transcript,
          opts.judgeModel,
        );
        ok = verdict.passed;
        reason = verdict.reason;
      } catch (e) {
        reason = `Error: ${(e as Error).message}`;
      }

      if (ok) passed++;
      else failed++;
      outcomes.push({ scenario, passed: ok, reason });

      await repo.addResult(runId, {
        scenarioId: scenario.id,
        label: scenario.label,
        category: scenario.category,
        lang: scenario.lang,
        passed: ok,
        reason,
        botText,
        toolCalls: toolNames.length ? JSON.stringify(toolNames) : null,
        turns,
        durationMs: Date.now() - started,
      }).catch((e) => console.warn("[lab] addResult:", e));
    }

    const total = passed + failed;
    await repo.finishRun(runId, {
      passed,
      failed,
      passRate: total ? passed / total : 0,
      meetsThreshold: total > 0 && passed / total >= threshold,
      cost,
      judgeModel: opts.judgeModel ?? null,
    });

    // Fallos → propuestas en Mejoras (kind kb_entry). Requieren completar la
    // info, así que llevan [COMPLETA] y el copiloto NO las auto-aplica.
    const suggestions = new SuggestionsRepo(db);
    for (const o of outcomes) {
      if (o.passed) continue;
      await suggestions
        .createIfNew({
          kind: "kb_entry",
          fingerprint: `lab:${o.scenario.id}`,
          title: `Laboratorio · ${o.scenario.label}`,
          payload: {
            title: `Laboratorio · ${o.scenario.label}`,
            question: o.scenario.userMessage ?? o.scenario.persona?.opening ?? o.scenario.label,
            content:
              `El agente falló este caso en el Laboratorio.\n` +
              `Rúbrica: ${o.scenario.rubric}\n` +
              `Motivo del juez: ${o.reason}\n` +
              `[COMPLETA AQUÍ] el dato o la regla que falta para que el bot lo resuelva bien.`,
          },
          evidence: `Falló en el Laboratorio (última corrida).`,
        })
        .catch((e) => console.warn("[lab] suggestion:", e));
    }
  } catch (e) {
    console.error("[lab] runLab:", e);
    await repo
      .finishRun(runId, { status: "error", passed, failed, passRate: 0, meetsThreshold: false, cost })
      .catch(() => {});
  }
}
