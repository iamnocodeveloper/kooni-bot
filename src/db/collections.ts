import { Db } from "./client";

/**
 * Cartera de cobros (nicho `cartera`): deudores, deuda, gestiones (casos),
 * interacciones, intentos, reglas y promesas de pago. Todas las tablas viven en
 * `schema.sql` (se crean en cualquier instalación; solo se usan con el nicho).
 */

export interface DebtorInput {
  name?: string;
  phone?: string;
  email?: string;
  documentId?: string;
  externalRef?: string;
  listId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DebtorRow {
  id: string;
  list_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  document_id: string | null;
  external_ref: string | null;
  created_at: number;
  updated_at: number;
  /** Saldo pendiente (suma de cuentas abiertas/en promesa/disputa). */
  balance: number;
  /** Cuentas abiertas. */
  accounts: number;
  /** Vencimiento más próximo (epoch ms) de las cuentas abiertas. */
  next_due: number | null;
  /** Etapa de la gestión más reciente. */
  stage: string | null;
  /** 1 si el deudor pidió no ser contactado (opt-out). */
  dnc?: number;
}

export interface AccountInput {
  debtorId: string;
  amount: number;
  dueDate?: number | null;
  concept?: string;
  currency?: string;
  notes?: string;
}

export interface InteractionInput {
  caseId?: string | null;
  debtorId: string;
  accountId?: string | null;
  channel: string;
  direction: string;
  kind: string;
  summary?: string;
  outcome?: string;
  payload?: unknown;
}

export interface PromiseInput {
  debtorId: string;
  accountId?: string | null;
  amount?: number | null;
  promisedDate?: number | null;
  notes?: string;
}

const OPEN_STATUSES = "('open','promise','disputed')";

const DEBTOR_SELECT = `
  SELECT d.*,
    (SELECT COALESCE(SUM(a.amount - a.paid), 0) FROM debt_accounts a
      WHERE a.debtor_id = d.id AND a.status IN ${OPEN_STATUSES}) AS balance,
    (SELECT COUNT(*) FROM debt_accounts a
      WHERE a.debtor_id = d.id AND a.status IN ${OPEN_STATUSES}) AS accounts,
    (SELECT MIN(a.due_date) FROM debt_accounts a
      WHERE a.debtor_id = d.id AND a.status IN ${OPEN_STATUSES} AND a.due_date IS NOT NULL) AS next_due,
    (SELECT c.stage FROM collection_cases c
      WHERE c.debtor_id = d.id ORDER BY c.updated_at DESC LIMIT 1) AS stage,
    (SELECT COUNT(*) FROM collection_dnc x WHERE x.debtor_id = d.id) AS dnc
  FROM debtors d
`;

/** Normaliza un teléfono a solo dígitos (para buscar/emparejar). */
export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export class CollectionsRepo {
  constructor(private readonly db: Db) {}

  // ── Listas ────────────────────────────────────────────────────────────────
  async createList(name: string, notes?: string): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.run("INSERT INTO debtor_lists (id, name, notes, created_at) VALUES (?, ?, ?, ?)", [
      id,
      name,
      notes ?? null,
      Date.now(),
    ]);
    return id;
  }

  async listLists(): Promise<{ id: string; name: string; created_at: number; n: number }[]> {
    return this.db.all(
      `SELECT l.*, (SELECT COUNT(*) FROM debtors d WHERE d.list_id = l.id) AS n
       FROM debtor_lists l ORDER BY l.created_at DESC`,
    );
  }

  // ── Reglas de cobranza (tramos de mora × canal × plantilla) ───────────────
  async listRules(): Promise<any[]> {
    return this.db.all("SELECT * FROM collection_rules ORDER BY min_days_overdue ASC, created_at ASC");
  }

  async upsertRule(input: {
    id?: string;
    name: string;
    minDaysOverdue?: number;
    maxDaysOverdue?: number | null;
    channel?: string;
    template?: string;
    maxAttempts?: number;
    active?: boolean;
  }): Promise<string> {
    const id = input.id || crypto.randomUUID();
    const existing = input.id
      ? await this.db.first<{ id: string }>("SELECT id FROM collection_rules WHERE id = ?", [input.id])
      : null;
    const vals = [
      input.name ?? "Regla",
      Math.max(0, Number(input.minDaysOverdue ?? 0)),
      input.maxDaysOverdue ?? null,
      input.channel ?? "whatsapp",
      input.template ?? null,
      Math.max(1, Number(input.maxAttempts ?? 3)),
      input.active === false ? 0 : 1,
    ];
    if (existing) {
      await this.db.run(
        `UPDATE collection_rules SET name=?, min_days_overdue=?, max_days_overdue=?, channel=?, template=?, max_attempts=?, active=? WHERE id=?`,
        [...vals, id],
      );
    } else {
      await this.db.run(
        `INSERT INTO collection_rules (id, name, min_days_overdue, max_days_overdue, channel, template, max_attempts, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ...vals, Date.now()],
      );
    }
    return id;
  }

  async deleteRule(id: string): Promise<void> {
    await this.db.run("DELETE FROM collection_rules WHERE id = ?", [id]);
  }

  /**
   * Cuentas en mora que caen en el tramo de una regla (para el motor).
   * `overdueFrom`/`overdueTo` son días de mora (mín/máx, null = sin tope).
   */
  async accountsInOverdueRange(overdueFrom: number, overdueTo: number | null, limit = 50): Promise<
    { account_id: string; debtor_id: string; amount: number; paid: number; due_date: number | null; currency: string }[]
  > {
    const now = Date.now();
    const fromMs = now - overdueFrom * 86_400_000;
    const conds = ["a.status = 'open'", "a.due_date IS NOT NULL", "a.due_date <= ?"];
    const params: unknown[] = [fromMs];
    if (overdueTo !== null && overdueTo !== undefined) {
      conds.push("a.due_date > ?");
      params.push(now - overdueTo * 86_400_000);
    }
    return this.db.all(
      `SELECT a.id AS account_id, a.debtor_id, a.amount, a.paid, a.due_date, a.currency
       FROM debt_accounts a
       WHERE ${conds.join(" AND ")}
       ORDER BY a.due_date ASC LIMIT ?`,
      [...params, Math.min(Math.max(limit, 1), 200)],
    );
  }

  /** Promesas pendientes que vencen en los próximos `withinHours` (o ya vencieron). */
  async promisesDue(withinHours = 24): Promise<any[]> {
    const until = Date.now() + withinHours * 3_600_000;
    return this.db.all(
      `SELECT p.*, d.name AS debtor_name, d.phone AS debtor_phone
       FROM payment_promises p LEFT JOIN debtors d ON d.id = p.debtor_id
       WHERE p.status = 'pending' AND p.promised_date IS NOT NULL AND p.promised_date <= ?
       ORDER BY p.promised_date ASC LIMIT 100`,
      [until],
    );
  }

  /** Marca promesas vencidas (fecha pasada) como incumplidas. */
  async markBrokenPromises(graceHours = 24): Promise<number> {
    const cutoff = Date.now() - graceHours * 3_600_000;
    const rows = await this.db.all<{ id: string }>(
      "SELECT id FROM payment_promises WHERE status = 'pending' AND promised_date IS NOT NULL AND promised_date < ?",
      [cutoff],
    );
    for (const r of rows) await this.setPromiseStatus(r.id, "broken").catch(() => {});
    return rows.length;
  }

  // ── Deudores ──────────────────────────────────────────────────────────────
  /** Alta idempotente por `external_ref` (si viene). Devuelve id + si era nuevo. */
  async upsertDebtor(input: DebtorInput): Promise<{ id: string; created: boolean }> {
    const now = Date.now();
    if (input.externalRef) {
      const existing = await this.db.first<{ id: string }>(
        "SELECT id FROM debtors WHERE external_ref = ?",
        [input.externalRef],
      );
      if (existing) {
        await this.db.run(
          `UPDATE debtors SET name = COALESCE(?, name), phone = COALESCE(?, phone),
             email = COALESCE(?, email), document_id = COALESCE(?, document_id),
             list_id = COALESCE(?, list_id), updated_at = ? WHERE id = ?`,
          [input.name ?? null, input.phone ?? null, input.email ?? null, input.documentId ?? null, input.listId ?? null, now, existing.id],
        );
        return { id: existing.id, created: false };
      }
    }
    const id = crypto.randomUUID();
    await this.db.run(
      `INSERT INTO debtors (id, list_id, name, phone, email, document_id, external_ref, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.listId ?? null,
        input.name ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.documentId ?? null,
        input.externalRef ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        now,
        now,
      ],
    );
    return { id, created: true };
  }

  async getDebtor(id: string): Promise<DebtorRow | null> {
    return this.db.first<DebtorRow>(`${DEBTOR_SELECT} WHERE d.id = ?`, [id]);
  }

  /** Busca por teléfono (últimos 10 dígitos) — para emparejar con WhatsApp. */
  async getDebtorByPhone(phone: string): Promise<DebtorRow | null> {
    const digits = normalizePhone(phone);
    if (digits.length < 6) return null;
    const tail = digits.slice(-10);
    return this.db.first<DebtorRow>(
      `${DEBTOR_SELECT} WHERE REPLACE(REPLACE(REPLACE(COALESCE(d.phone,''),'+',''),' ',''),'-','') LIKE ? ORDER BY d.updated_at DESC LIMIT 1`,
      [`%${tail}`],
    );
  }

  /** Busca por referencia externa (la que se importó). */
  async getDebtorByRef(ref: string): Promise<DebtorRow | null> {
    const v = (ref ?? "").trim();
    if (!v) return null;
    return this.db.first<DebtorRow>(`${DEBTOR_SELECT} WHERE d.external_ref = ? LIMIT 1`, [v]);
  }

  async listDebtors(opts: { q?: string; listId?: string; stage?: string; limit?: number; offset?: number } = {}): Promise<DebtorRow[]> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (opts.q) {
      conds.push("(d.name LIKE ? OR d.phone LIKE ? OR d.document_id LIKE ? OR d.external_ref LIKE ?)");
      const like = `%${opts.q}%`;
      params.push(like, like, like, like);
    }
    if (opts.listId) {
      conds.push("d.list_id = ?");
      params.push(opts.listId);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const rows = await this.db.all<DebtorRow>(
      `${DEBTOR_SELECT} ${where} ORDER BY (next_due IS NULL), next_due ASC, d.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, Math.min(Math.max(opts.limit ?? 100, 1), 500), Math.max(0, opts.offset ?? 0)],
    );
    return opts.stage ? rows.filter((r) => r.stage === opts.stage) : rows;
  }

  /** Reportes de cobranza: recuperación, por canal y embudo por etapa. */
  async report(): Promise<{
    totalDebt: number;
    totalPaid: number;
    recoveryRate: number;
    byChannel: { channel: string; intentos: number; contactados: number; promesas: number; pagos: number }[];
    byOutcome: { outcome: string; n: number }[];
    byStage: { stage: string; n: number }[];
  }> {
    const stats = await this.stats();
    const channels = await this.db.all<{ channel: string; intentos: number; contactados: number; promesas: number; pagos: number }>(
      `SELECT channel,
         COUNT(*) AS intentos,
         SUM(CASE WHEN outcome IN ('contactado','promesa','pago') THEN 1 ELSE 0 END) AS contactados,
         SUM(CASE WHEN outcome = 'promesa' THEN 1 ELSE 0 END) AS promesas,
         SUM(CASE WHEN outcome = 'pago' THEN 1 ELSE 0 END) AS pagos
       FROM collection_contact_attempts GROUP BY channel ORDER BY intentos DESC`,
    );
    const byOutcome = await this.db.all<{ outcome: string; n: number }>(
      `SELECT COALESCE(outcome,'(sin)') AS outcome, COUNT(*) AS n FROM collection_interactions GROUP BY outcome ORDER BY n DESC LIMIT 12`,
    );
    const byStage = await this.db.all<{ stage: string; n: number }>(
      "SELECT stage, COUNT(*) AS n FROM collection_cases GROUP BY stage ORDER BY n DESC",
    );
    const total = stats.totalPaid + stats.totalDebt;
    return {
      totalDebt: stats.totalDebt,
      totalPaid: stats.totalPaid,
      recoveryRate: total > 0 ? stats.totalPaid / total : 0,
      byChannel: channels,
      byOutcome,
      byStage,
    };
  }

  async updateDebtor(id: string, patch: Partial<DebtorInput>): Promise<void> {
    await this.db.run(
      `UPDATE debtors SET name = COALESCE(?, name), phone = COALESCE(?, phone),
         email = COALESCE(?, email), document_id = COALESCE(?, document_id), updated_at = ? WHERE id = ?`,
      [patch.name ?? null, patch.phone ?? null, patch.email ?? null, patch.documentId ?? null, Date.now(), id],
    );
  }

  // ── Deuda (cuentas) ───────────────────────────────────────────────────────
  async addAccount(input: AccountInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO debt_accounts (id, debtor_id, amount, paid, currency, due_date, status, concept, notes, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, 'open', ?, ?, ?, ?)`,
      [id, input.debtorId, input.amount, input.currency ?? "USD", input.dueDate ?? null, input.concept ?? null, input.notes ?? null, now, now],
    );
    return id;
  }

  async listAccounts(debtorId: string): Promise<any[]> {
    return this.db.all("SELECT * FROM debt_accounts WHERE debtor_id = ? ORDER BY due_date ASC, created_at ASC", [debtorId]);
  }

  /** Registra un pago contra una cuenta (deja `paid` topeado al `amount`). */
  async registerPayment(accountId: string, amount: number): Promise<void> {
    const acc = await this.db.first<{ amount: number; paid: number; debtor_id: string }>(
      "SELECT amount, paid, debtor_id FROM debt_accounts WHERE id = ?",
      [accountId],
    );
    if (!acc) return;
    const paid = Math.min(acc.amount, (acc.paid ?? 0) + Math.max(0, amount));
    const done = paid >= acc.amount;
    await this.db.run("UPDATE debt_accounts SET paid = ?, status = ?, updated_at = ? WHERE id = ?", [
      paid,
      done ? "paid" : "open",
      Date.now(),
      accountId,
    ]);
    // Si quedó saldada, las promesas de esa cuenta se marcan cumplidas.
    if (done) {
      try {
        await this.db.run(
          "UPDATE payment_promises SET status = 'kept', updated_at = ? WHERE account_id = ? AND status = 'pending'",
          [Date.now(), accountId],
        );
      } catch {
        /* tabla opcional */
      }
      await this.setCaseStageForDebtor(acc.debtor_id, "pagado").catch(() => {});
    }
  }

  /** Mueve a `stage` el caso más reciente del deudor (si tiene). */
  async setCaseStageForDebtor(debtorId: string, stage: string): Promise<void> {
    const c = await this.db.first<{ id: string }>(
      "SELECT id FROM collection_cases WHERE debtor_id = ? ORDER BY updated_at DESC LIMIT 1",
      [debtorId],
    );
    if (c) await this.setCaseStage(c.id, stage);
  }

  // ── Opt-out / no contactar (DNC) ────────────────────────────────────────
  async setDnc(debtorId: string, on: boolean, reason?: string, phone?: string | null): Promise<void> {
    if (!on) {
      await this.db.run("DELETE FROM collection_dnc WHERE debtor_id = ?", [debtorId]);
      return;
    }
    await this.db.run(
      `INSERT INTO collection_dnc (debtor_id, phone, reason, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(debtor_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`,
      [debtorId, phone ?? null, reason ?? null, Date.now()],
    );
  }

  async isDnc(debtorId: string): Promise<boolean> {
    const r = await this.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM collection_dnc WHERE debtor_id = ?", [debtorId]);
    return (r?.n ?? 0) > 0;
  }

  async listDnc(): Promise<{ debtor_id: string; phone: string | null; reason: string | null; created_at: number }[]> {
    return this.db.all("SELECT * FROM collection_dnc ORDER BY created_at DESC LIMIT 500");
  }

  async setAccountStatus(accountId: string, status: string): Promise<void> {
    await this.db.run("UPDATE debt_accounts SET status = ?, updated_at = ? WHERE id = ?", [status, Date.now(), accountId]);
  }

  // ── Gestiones (casos) ─────────────────────────────────────────────────────
  async ensureCase(debtorId: string, accountId?: string | null): Promise<string> {
    const existing = await this.db.first<{ id: string }>(
      "SELECT id FROM collection_cases WHERE debtor_id = ? ORDER BY updated_at DESC LIMIT 1",
      [debtorId],
    );
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO collection_cases (id, debtor_id, account_id, stage, attempts, created_at, updated_at)
       VALUES (?, ?, ?, 'nuevo', 0, ?, ?)`,
      [id, debtorId, accountId ?? null, now, now],
    );
    return id;
  }

  async setCaseStage(caseId: string, stage: string): Promise<void> {
    await this.db.run("UPDATE collection_cases SET stage = ?, updated_at = ? WHERE id = ?", [stage, Date.now(), caseId]);
  }

  async bumpAttempts(caseId: string): Promise<void> {
    await this.db.run(
      "UPDATE collection_cases SET attempts = attempts + 1, last_contact_at = ?, updated_at = ? WHERE id = ?",
      [Date.now(), Date.now(), caseId],
    );
  }

  // ── Interacciones / intentos ──────────────────────────────────────────────
  async logInteraction(input: InteractionInput): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.run(
      `INSERT INTO collection_interactions (id, case_id, debtor_id, account_id, channel, direction, kind, summary, outcome, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.caseId ?? null,
        input.debtorId,
        input.accountId ?? null,
        input.channel,
        input.direction,
        input.kind,
        input.summary ?? null,
        input.outcome ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
        Date.now(),
      ],
    );
    return id;
  }

  async listInteractions(debtorId: string, limit = 50): Promise<any[]> {
    return this.db.all(
      "SELECT * FROM collection_interactions WHERE debtor_id = ? ORDER BY created_at DESC LIMIT ?",
      [debtorId, limit],
    );
  }

  async logAttempt(caseId: string | null, debtorId: string, channel: string, outcome?: string): Promise<void> {
    await this.db.run(
      "INSERT INTO collection_contact_attempts (case_id, debtor_id, channel, at, outcome) VALUES (?, ?, ?, ?, ?)",
      [caseId, debtorId, channel, Date.now(), outcome ?? null],
    );
  }

  // ── Promesas de pago ──────────────────────────────────────────────────────
  async createPromise(input: PromiseInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO payment_promises (id, debtor_id, account_id, amount, promised_date, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [id, input.debtorId, input.accountId ?? null, input.amount ?? null, input.promisedDate ?? null, input.notes ?? null, now, now],
    );
    if (input.accountId) await this.setAccountStatus(input.accountId, "promise").catch(() => {});
    return id;
  }

  async listPromises(debtorId?: string): Promise<any[]> {
    return debtorId
      ? this.db.all("SELECT * FROM payment_promises WHERE debtor_id = ? ORDER BY promised_date ASC", [debtorId])
      : this.db.all(
          `SELECT p.*, d.name AS debtor_name, d.phone AS debtor_phone
           FROM payment_promises p LEFT JOIN debtors d ON d.id = p.debtor_id
           WHERE p.status = 'pending' ORDER BY p.promised_date ASC LIMIT 200`,
        );
  }

  async setPromiseStatus(id: string, status: string): Promise<void> {
    await this.db.run("UPDATE payment_promises SET status = ?, updated_at = ? WHERE id = ?", [status, Date.now(), id]);
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  async stats(): Promise<{
    debtors: number;
    totalDebt: number;
    totalPaid: number;
    promised: number;
    overdue: number;
    cases: number;
  }> {
    const [debtors, tot, paid, prom, over, cases] = await Promise.all([
      this.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM debtors"),
      this.db.first<{ v: number }>(
        `SELECT COALESCE(SUM(amount - paid), 0) AS v FROM debt_accounts WHERE status IN ${OPEN_STATUSES}`,
      ),
      this.db.first<{ v: number }>("SELECT COALESCE(SUM(paid), 0) AS v FROM debt_accounts"),
      this.db.first<{ v: number }>("SELECT COALESCE(SUM(amount), 0) AS v FROM payment_promises WHERE status = 'pending'"),
      this.db.first<{ v: number }>(
        `SELECT COALESCE(SUM(amount - paid), 0) AS v FROM debt_accounts
         WHERE status IN ${OPEN_STATUSES} AND due_date IS NOT NULL AND due_date < ?`,
        [Date.now()],
      ),
      this.db.first<{ n: number }>(
        "SELECT COUNT(*) AS n FROM collection_cases WHERE stage NOT IN ('pagado','incobrable')",
      ),
    ]);
    return {
      debtors: debtors?.n ?? 0,
      totalDebt: tot?.v ?? 0,
      totalPaid: paid?.v ?? 0,
      promised: prom?.v ?? 0,
      overdue: over?.v ?? 0,
      cases: cases?.n ?? 0,
    };
  }
}

/** Días de mora desde una fecha de vencimiento (0 si no venció / sin fecha). */
export function daysOverdue(dueDate: number | null | undefined): number {
  if (!dueDate) return 0;
  const d = Math.floor((Date.now() - dueDate) / 86_400_000);
  return d > 0 ? d : 0;
}
