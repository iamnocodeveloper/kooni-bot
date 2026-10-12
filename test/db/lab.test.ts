import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { LabRepo } from "../../src/db/lab";

let db: Db;
beforeEach(async () => {
  const mf = await createTestMiniflare();
  db = new Db((await mf.getD1Database("DB")) as any);
});

describe("LabRepo", () => {
  it("crea una corrida, agrega resultados y la cierra", async () => {
    const repo = new LabRepo(db);
    const runId = await repo.createRun({ kind: "quick", threshold: 0.85 });
    let run = await repo.getRun(runId);
    expect(run?.status).toBe("running");
    expect(run?.kind).toBe("quick");

    await repo.addResult(runId, { scenarioId: "es-faq-hours", label: "es-faq-hours", category: "faq", passed: true, reason: "ok" });
    await repo.addResult(runId, { scenarioId: "en-handoff-explicit", passed: false, reason: "no escaló" });

    await repo.finishRun(runId, { passed: 1, failed: 1, passRate: 0.5, meetsThreshold: false, cost: 0.01 });
    run = await repo.getRun(runId);
    expect(run?.status).toBe("done");
    expect(run?.passed).toBe(1);
    expect(run?.failed).toBe(1);
    expect(run?.meets_threshold).toBe(0);

    const results = await repo.results(runId);
    expect(results).toHaveLength(2);
    expect(results[0].scenario_id).toBe("es-faq-hours");
  });

  it("previousRun encuentra la corrida anterior del mismo tipo", async () => {
    const repo = new LabRepo(db);
    const first = await repo.createRun({ kind: "quick", threshold: 0.85 });
    await repo.finishRun(first, { passed: 1, failed: 0, passRate: 1, meetsThreshold: true });
    const second = await repo.createRun({ kind: "quick", threshold: 0.85 });
    const run2 = await repo.getRun(second);
    const prev = await repo.previousRun("quick", run2!.started_at);
    expect(prev?.id).toBe(first);
    // Otro tipo no cruza.
    expect(await repo.previousRun("personas", run2!.started_at)).toBeNull();
  });
});
