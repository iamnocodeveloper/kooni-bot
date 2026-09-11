// Registro de scrapping (Web Sync / Decodo) — control interno del dueño.
//
// Una corrida de scraping (cron nocturno, botón manual o endpoint por token)
// deja UNA fila en `web_sync_runs` con el resumen (cuántos autos hay, cuántos
// entraron, salieron o cambiaron, errores, duración) y N filas en
// `web_sync_changes` con el detalle de cada auto/campo que cambió. Se muestra
// en /admin/scraping (solo lectura) y se purga a los 90 días.
import { Db } from "./client";

export type WebSyncTrigger = "cron" | "manual" | "api" | "rebuild";

export interface WebSyncRun {
  id: string;
  at: number;
  trigger: WebSyncTrigger;
  url?: string;
  mode?: string;
  durationMs?: number;
  vehiclesTotal: number;
  added: number;
  removed: number;
  changed: number;
  errors: number;
  errorMsg?: string;
  note?: string;
}

export type WebSyncChangeKind = "added" | "removed" | "changed";

export interface WebSyncChange {
  id: string;
  runId: string;
  at: number;
  kind: WebSyncChangeKind;
  vehicleKey?: string;
  vin?: string;
  title?: string;
  url?: string;
  /** Solo en `changed`: campo que cambió (título, precio, millas, condición, link, desglose). */
  field?: string;
  oldValue?: string;
  newValue?: string;
}

export interface WebSyncRunInput {
  at?: number;
  trigger: WebSyncTrigger;
  url?: string;
  mode?: string;
  durationMs?: number;
  vehiclesTotal?: number;
  added?: number;
  removed?: number;
  changed?: number;
  errors?: number;
  errorMsg?: string;
  note?: string;
}

export interface WebSyncChangeInput {
  kind: WebSyncChangeKind;
  vehicleKey?: string | null;
  vin?: string | null;
  title?: string | null;
  url?: string | null;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

export interface WebSyncRunFilter {
  /** Keyset: solo corridas con `at < before` (paginación hacia atrás). */
  before?: number;
  trigger?: string;
  limit?: number;
}

/** Totales agregados desde `since` (epoch ms) — para los KPIs de la vista. */
export interface WebSyncStats {
  runs: number;
  added: number;
  removed: number;
  changed: number;
  errors: number;
}

interface RunRow {
  id: string;
  at: number;
  trigger: string;
  url: string | null;
  mode: string | null;
  duration_ms: number | null;
  vehicles_total: number;
  added: number;
  removed: number;
  changed: number;
  errors: number;
  error_msg: string | null;
  note: string | null;
}

interface ChangeRow {
  id: string;
  run_id: string;
  at: number;
  kind: string;
  vehicle_key: string | null;
  vin: string | null;
  title: string | null;
  url: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
}

function rowToRun(r: RunRow): WebSyncRun {
  return {
    id: r.id,
    at: r.at,
    trigger: (r.trigger as WebSyncTrigger) ?? "manual",
    url: r.url ?? undefined,
    mode: r.mode ?? undefined,
    durationMs: r.duration_ms ?? undefined,
    vehiclesTotal: r.vehicles_total ?? 0,
    added: r.added ?? 0,
    removed: r.removed ?? 0,
    changed: r.changed ?? 0,
    errors: r.errors ?? 0,
    errorMsg: r.error_msg ?? undefined,
    note: r.note ?? undefined,
  };
}

function rowToChange(r: ChangeRow): WebSyncChange {
  return {
    id: r.id,
    runId: r.run_id,
    at: r.at,
    kind: (r.kind as WebSyncChangeKind) ?? "changed",
    vehicleKey: r.vehicle_key ?? undefined,
    vin: r.vin ?? undefined,
    title: r.title ?? undefined,
    url: r.url ?? undefined,
    field: r.field ?? undefined,
    oldValue: r.old_value ?? undefined,
    newValue: r.new_value ?? undefined,
  };
}

export class WebSyncLogRepo {
  constructor(private readonly db: Db) {}

  /**
   * Guarda una corrida y su detalle. Idempotente por corrida (el `id` lo genera
   * el repo); los `changes` sin datos se ignoran.
   */
  async recordRun(run: WebSyncRunInput, changes: WebSyncChangeInput[] = []): Promise<string> {
    const id = crypto.randomUUID();
    const at = run.at ?? Date.now();
    await this.db.run(
      `INSERT INTO web_sync_runs
        (id, at, trigger, url, mode, duration_ms, vehicles_total, added, removed, changed, errors, error_msg, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        at,
        run.trigger,
        run.url ?? null,
        run.mode ?? null,
        run.durationMs ?? null,
        run.vehiclesTotal ?? 0,
        run.added ?? 0,
        run.removed ?? 0,
        run.changed ?? 0,
        run.errors ?? 0,
        run.errorMsg ?? null,
        run.note ?? null,
      ],
    );
    for (const c of changes) {
      await this.db.run(
        `INSERT INTO web_sync_changes
          (id, run_id, at, kind, vehicle_key, vin, title, url, field, old_value, new_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          id,
          at,
          c.kind,
          c.vehicleKey ?? null,
          c.vin ?? null,
          c.title ?? null,
          c.url ?? null,
          c.field ?? null,
          c.oldValue ?? null,
          c.newValue ?? null,
        ],
      );
    }
    return id;
  }

  async listRuns(f: WebSyncRunFilter = {}): Promise<WebSyncRun[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.before) {
      where.push("at < ?");
      params.push(f.before);
    }
    if (f.trigger) {
      where.push("trigger = ?");
      params.push(f.trigger);
    }
    const limit = Math.min(Math.max(f.limit ?? 60, 1), 500);
    params.push(limit);
    const rows = await this.db.all<RunRow>(
      `SELECT * FROM web_sync_runs
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY at DESC LIMIT ?`,
      params,
    );
    return rows.map(rowToRun);
  }

  async getRun(id: string): Promise<WebSyncRun | null> {
    const row = await this.db.first<RunRow>("SELECT * FROM web_sync_runs WHERE id = ?", [id]);
    return row ? rowToRun(row) : null;
  }

  /** Detalle de una corrida: primero lo que entró, luego lo que salió y los cambios. */
  async listChanges(runId: string): Promise<WebSyncChange[]> {
    const rows = await this.db.all<ChangeRow>(
      `SELECT * FROM web_sync_changes WHERE run_id = ?
       ORDER BY CASE kind WHEN 'added' THEN 0 WHEN 'changed' THEN 1 ELSE 2 END, title`,
      [runId],
    );
    return rows.map(rowToChange);
  }

  async countRuns(): Promise<number> {
    const row = await this.db.first<{ n: number }>("SELECT COUNT(*) as n FROM web_sync_runs");
    return row?.n ?? 0;
  }

  /** Totales agregados desde `since` (epoch ms). */
  async stats(since: number): Promise<WebSyncStats> {
    const row = await this.db.first<{
      runs: number;
      added: number;
      removed: number;
      changed: number;
      errors: number;
    }>(
      `SELECT COUNT(*) as runs,
              COALESCE(SUM(added), 0) as added,
              COALESCE(SUM(removed), 0) as removed,
              COALESCE(SUM(changed), 0) as changed,
              COALESCE(SUM(errors), 0) as errors
         FROM web_sync_runs WHERE at >= ?`,
      [since],
    );
    return {
      runs: row?.runs ?? 0,
      added: row?.added ?? 0,
      removed: row?.removed ?? 0,
      changed: row?.changed ?? 0,
      errors: row?.errors ?? 0,
    };
  }

  /** Borra corridas y cambios con `at < before`. Devuelve las corridas eliminadas. */
  async purgeOld(before: number): Promise<number> {
    await this.db.run("DELETE FROM web_sync_changes WHERE at < ?", [before]);
    const r = await this.db.run("DELETE FROM web_sync_runs WHERE at < ?", [before]);
    return r.meta?.changes ?? 0;
  }
}
