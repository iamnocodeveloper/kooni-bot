import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { WebSyncLogRepo } from "../../src/db/webSyncLog";

let repo: WebSyncLogRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  repo = new WebSyncLogRepo(new Db((await mf.getD1Database("DB")) as any));
});

describe("WebSyncLogRepo", () => {
  it("guarda la corrida + su detalle y las lista más reciente primero", async () => {
    const id = await repo.recordRun(
      { at: 1000, trigger: "cron", vehiclesTotal: 400, added: 1, removed: 1, changed: 1, durationMs: 4200 },
      [
        { kind: "added", vin: "D", title: "2022 Kia Telluride" },
        { kind: "removed", vin: "B", title: "2019 Kia Forte" },
        { kind: "changed", vin: "A", title: "2020 Kia Sorento", field: "Precio", oldValue: "$20,000", newValue: "$19,000" },
      ],
    );
    await repo.recordRun({ at: 2000, trigger: "manual", vehiclesTotal: 400 });

    const runs = await repo.listRuns();
    expect(runs.map((r) => r.trigger)).toEqual(["manual", "cron"]);
    expect(runs[1].id).toBe(id);
    expect(runs[1]).toMatchObject({ added: 1, removed: 1, changed: 1, vehiclesTotal: 400, durationMs: 4200 });

    // Detalle: primero lo que entró, luego los cambios y por último lo que salió.
    const changes = await repo.listChanges(id);
    expect(changes.map((c) => c.kind)).toEqual(["added", "changed", "removed"]);
    expect(changes.find((c) => c.kind === "changed")).toMatchObject({
      field: "Precio",
      oldValue: "$20,000",
      newValue: "$19,000",
      title: "2020 Kia Sorento",
    });
  });

  it("filtra por disparador y pagina con `before`", async () => {
    for (let i = 1; i <= 5; i++) {
      await repo.recordRun({ at: i * 100, trigger: i % 2 === 0 ? "cron" : "manual", vehiclesTotal: i });
    }
    expect((await repo.listRuns({ trigger: "cron" })).map((r) => r.at)).toEqual([400, 200]);

    const page1 = await repo.listRuns({ limit: 2 });
    expect(page1.map((r) => r.at)).toEqual([500, 400]);
    const page2 = await repo.listRuns({ limit: 2, before: page1[page1.length - 1].at });
    expect(page2.map((r) => r.at)).toEqual([300, 200]);
  });

  it("stats agrega desde `since`", async () => {
    await repo.recordRun({ at: 100, trigger: "cron", added: 1, removed: 0, changed: 2, errors: 0 });
    await repo.recordRun({ at: 200, trigger: "cron", added: 3, removed: 2, changed: 0, errors: 1 });
    const s = await repo.stats(150);
    expect(s).toEqual({ runs: 1, added: 3, removed: 2, changed: 0, errors: 1 });
    const all = await repo.stats(0);
    expect(all).toEqual({ runs: 2, added: 4, removed: 2, changed: 2, errors: 1 });
  });

  it("purgeOld borra corridas y cambios viejos", async () => {
    const id = await repo.recordRun(
      { at: 100, trigger: "cron" },
      [{ kind: "added", title: "Viejo" }],
    );
    await repo.recordRun({ at: 300, trigger: "cron" }, [{ kind: "added", title: "Nuevo" }]);

    expect(await repo.purgeOld(200)).toBe(1);
    expect(await repo.countRuns()).toBe(1);
    expect(await repo.listChanges(id)).toEqual([]);
  });
});
