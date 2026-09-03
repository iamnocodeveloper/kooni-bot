import { Db } from "./client";

/**
 * Registro de auditoría del panel (§ U). Una fila por acción de un operador del
 * panel `/admin`: quién (huella de IP + navegador), cuándo, qué acción, qué
 * cambió y el valor anterior vs. el nuevo. Solo lectura desde el panel — la
 * única baja es la purga nocturna por retención.
 */
export interface AuditEntry {
  id: string;
  at: number;
  actorName?: string;
  actorIpHash?: string;
  actorUa?: string;
  action: string;
  target?: string;
  targetLabel?: string;
  beforeVal?: string;
  afterVal?: string;
  method?: string;
  path?: string;
  result: string; // ok | denied | error
  meta?: string;
}

/** Datos que aporta quien registra la acción (el resto lo pone el repo/contexto). */
export type AuditInput = Omit<AuditEntry, "id" | "at" | "result"> &
  Partial<Pick<AuditEntry, "at" | "result">>;

export interface AuditFilter {
  /** Keyset: solo filas con `at < before` (paginación hacia atrás). */
  before?: number;
  action?: string;
  actorIpHash?: string;
  /** LIKE sobre target_label / target / before_val / after_val. */
  text?: string;
  limit?: number;
}

interface AuditRow {
  id: string;
  at: number;
  actor_name: string | null;
  actor_ip_hash: string | null;
  actor_ua: string | null;
  action: string;
  target: string | null;
  target_label: string | null;
  before_val: string | null;
  after_val: string | null;
  method: string | null;
  path: string | null;
  result: string;
  meta: string | null;
}

function rowToEntry(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    at: r.at,
    actorName: r.actor_name ?? undefined,
    actorIpHash: r.actor_ip_hash ?? undefined,
    actorUa: r.actor_ua ?? undefined,
    action: r.action,
    target: r.target ?? undefined,
    targetLabel: r.target_label ?? undefined,
    beforeVal: r.before_val ?? undefined,
    afterVal: r.after_val ?? undefined,
    method: r.method ?? undefined,
    path: r.path ?? undefined,
    result: r.result,
    meta: r.meta ?? undefined,
  };
}

export class AuditRepo {
  constructor(private readonly db: Db) {}

  async log(e: AuditInput): Promise<void> {
    await this.db.run(
      `INSERT INTO audit_log
        (id, at, actor_name, actor_ip_hash, actor_ua, action, target, target_label,
         before_val, after_val, method, path, result, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        e.at ?? Date.now(),
        e.actorName ?? null,
        e.actorIpHash ?? null,
        e.actorUa ?? null,
        e.action,
        e.target ?? null,
        e.targetLabel ?? null,
        e.beforeVal ?? null,
        e.afterVal ?? null,
        e.method ?? null,
        e.path ?? null,
        e.result ?? "ok",
        e.meta ?? null,
      ],
    );
  }

  async list(f: AuditFilter = {}): Promise<AuditEntry[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.before) {
      where.push("at < ?");
      params.push(f.before);
    }
    if (f.action) {
      where.push("action = ?");
      params.push(f.action);
    }
    if (f.actorIpHash) {
      where.push("actor_ip_hash = ?");
      params.push(f.actorIpHash);
    }
    if (f.text) {
      where.push("(target_label LIKE ? OR target LIKE ? OR before_val LIKE ? OR after_val LIKE ?)");
      const t = `%${f.text}%`;
      params.push(t, t, t, t);
    }
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 500);
    params.push(limit);
    const rows = await this.db.all<AuditRow>(
      `SELECT * FROM audit_log
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY at DESC LIMIT ?`,
      params,
    );
    return rows.map(rowToEntry);
  }

  /** Acciones distintas presentes en el log (para el filtro de la vista). */
  async distinctActions(): Promise<string[]> {
    const rows = await this.db.all<{ action: string }>(
      "SELECT DISTINCT action FROM audit_log ORDER BY action",
    );
    return rows.map((r) => r.action);
  }

  async count(): Promise<number> {
    const row = await this.db.first<{ n: number }>("SELECT COUNT(*) as n FROM audit_log");
    return row?.n ?? 0;
  }

  /** Borra filas con `at < before`. Devuelve cuántas se eliminaron. */
  async purgeOld(before: number): Promise<number> {
    const r = await this.db.run("DELETE FROM audit_log WHERE at < ?", [before]);
    return r.meta?.changes ?? 0;
  }
}
