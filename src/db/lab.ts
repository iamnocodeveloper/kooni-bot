import { Db } from "./client";

// Persistencia del Laboratorio: corridas (lab_runs) y resultados por escenario
// (lab_results). Habilita el score, los hallazgos y el delta entre corridas.

export type LabRunKind = "quick" | "personas";
export type LabRunStatus = "running" | "done" | "error";

export interface LabRun {
  id: string;
  kind: LabRunKind;
  status: LabRunStatus;
  judge_model: string | null;
  threshold: number;
  scenarios_count: number;
  passed: number;
  failed: number;
  pass_rate: number | null;
  meets_threshold: number | null;
  cost: number;
  note: string | null;
  started_at: number;
  finished_at: number | null;
}

export interface LabResultRow {
  id: string;
  run_id: string;
  scenario_id: string;
  label: string | null;
  category: string | null;
  lang: string | null;
  passed: number;
  reason: string | null;
  bot_text: string | null;
  tool_calls: string | null;
  turns: number | null;
  duration_ms: number | null;
  created_at: number;
}

export interface NewLabResult {
  scenarioId: string;
  label?: string | null;
  category?: string | null;
  lang?: string | null;
  passed: boolean;
  reason?: string | null;
  botText?: string | null;
  toolCalls?: string | null;
  turns?: number | null;
  durationMs?: number | null;
}

export class LabRepo {
  constructor(private readonly db: Db) {}

  async createRun(input: {
    kind: LabRunKind;
    judgeModel?: string | null;
    threshold: number;
    scenariosCount?: number;
    note?: string | null;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.run(
      `INSERT INTO lab_runs (id, kind, status, judge_model, threshold, scenarios_count, note, started_at)
       VALUES (?, ?, 'running', ?, ?, ?, ?, ?)`,
      [
        id,
        input.kind,
        input.judgeModel ?? null,
        input.threshold,
        input.scenariosCount ?? 0,
        input.note ?? null,
        Date.now(),
      ],
    );
    return id;
  }

  async addResult(runId: string, r: NewLabResult): Promise<void> {
    await this.db.run(
      `INSERT INTO lab_results
        (id, run_id, scenario_id, label, category, lang, passed, reason, bot_text, tool_calls, turns, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        runId,
        r.scenarioId,
        r.label ?? null,
        r.category ?? null,
        r.lang ?? null,
        r.passed ? 1 : 0,
        r.reason ?? null,
        r.botText ?? null,
        r.toolCalls ?? null,
        r.turns ?? null,
        r.durationMs ?? null,
        Date.now(),
      ],
    );
  }

  async finishRun(
    runId: string,
    input: {
      status?: LabRunStatus;
      passed: number;
      failed: number;
      passRate: number;
      meetsThreshold: boolean;
      cost?: number;
      judgeModel?: string | null;
    },
  ): Promise<void> {
    const total = input.passed + input.failed;
    await this.db.run(
      `UPDATE lab_runs SET status = ?, passed = ?, failed = ?, pass_rate = ?, meets_threshold = ?,
        cost = ?, scenarios_count = ?, judge_model = COALESCE(?, judge_model), finished_at = ? WHERE id = ?`,
      [
        input.status ?? "done",
        input.passed,
        input.failed,
        input.passRate,
        input.meetsThreshold ? 1 : 0,
        input.cost ?? 0,
        total,
        input.judgeModel ?? null,
        Date.now(),
        runId,
      ],
    );
  }

  async getRun(id: string): Promise<LabRun | null> {
    return this.db.first<LabRun>("SELECT * FROM lab_runs WHERE id = ?", [id]);
  }

  async results(runId: string): Promise<LabResultRow[]> {
    return this.db.all<LabResultRow>(
      "SELECT * FROM lab_results WHERE run_id = ? ORDER BY created_at ASC",
      [runId],
    );
  }

  async listRuns(kind?: LabRunKind, limit = 20): Promise<LabRun[]> {
    if (kind) {
      return this.db.all<LabRun>(
        "SELECT * FROM lab_runs WHERE kind = ? ORDER BY started_at DESC LIMIT ?",
        [kind, limit],
      );
    }
    return this.db.all<LabRun>("SELECT * FROM lab_runs ORDER BY started_at DESC LIMIT ?", [limit]);
  }

  /** Corrida terminada anterior del mismo tipo (para el delta). */
  async previousRun(kind: LabRunKind, beforeStartedAt: number): Promise<LabRun | null> {
    return this.db.first<LabRun>(
      "SELECT * FROM lab_runs WHERE kind = ? AND status = 'done' AND started_at < ? ORDER BY started_at DESC LIMIT 1",
      [kind, beforeStartedAt],
    );
  }
}
