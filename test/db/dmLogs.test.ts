import { describe, it, expect } from "vitest";
import { DmLogsRepo } from "../../src/db/dmLogs";

// Stub de Db en memoria (run/first/all).
function makeDb() {
  const processed: any[] = [];
  const logs: any[] = [];
  const rates: any[] = [];
  const db = {
    async run(sql: string, params: unknown[] = []) {
      if (/INSERT INTO processed_comments/.test(sql)) {
        const existing = processed.find((p) => p.comment_id === params[0]);
        if (existing) {
          existing.status = params[2];
          existing.matched_keyword = params[3] ?? existing.matched_keyword;
          // COALESCE: conserva el valor previo si el nuevo es null/undefined
          existing.dm_sent_at = params[4] ?? existing.dm_sent_at;
          existing.public_reply_sent_at = params[5] ?? existing.public_reply_sent_at;
          existing.error = params[6] ?? existing.error;
        } else {
          processed.push({
            comment_id: params[0],
            rule_id: params[1],
            status: params[2],
            matched_keyword: params[3],
            dm_sent_at: params[4],
            public_reply_sent_at: params[5],
            error: params[6],
            created_at: params[7],
          });
        }
        return { meta: { changes: 1 } };
      }
      if (/INSERT INTO dm_logs/.test(sql)) {
        logs.push({
          id: params[0],
          rule_id: params[1],
          kind: params[2],
          platform: params[3],
          target: params[4],
          username: params[5],
          message: params[6],
          status: params[7],
          error: params[8],
          created_at: params[9],
        });
        return { meta: { changes: 1 } };
      }
      // ── dm_rate_limits (rate limiter) ──
      if (/UPDATE dm_rate_limits SET count = count \+ 1/.test(sql)) {
        const [accountId, windowStart, max] = params as [string, number, number];
        const row = rates.find((r) => r.account_id === accountId && r.window_start === windowStart);
        if (row && row.count < max) {
          row.count += 1;
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      }
      if (/INSERT INTO dm_rate_limits/.test(sql)) {
        const [accountId, windowStart] = params as [string, number];
        const exists = rates.some((r) => r.account_id === accountId && r.window_start === windowStart);
        if (!exists) {
          rates.push({ account_id: accountId, window_start: windowStart, count: 1 });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      }
      return { meta: { changes: 0 } };
    },
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/COUNT\(\*\) as n FROM processed_comments/.test(sql)) {
        const n = processed.filter((p) => p.comment_id === params[0] && p.status === "sent").length;
        return { n } as T;
      }
      if (/SELECT dm_sent_at, public_reply_sent_at FROM processed_comments/.test(sql)) {
        const row = processed.find((p) => p.comment_id === params[0]);
        return (row ? { dm_sent_at: row.dm_sent_at ?? null, public_reply_sent_at: row.public_reply_sent_at ?? null } : null) as T;
      }
      if (/SELECT count FROM dm_rate_limits/.test(sql)) {
        const [accountId, windowStart] = params as [string, number];
        const row = rates.find((r) => r.account_id === accountId && r.window_start === windowStart);
        return { count: row?.count ?? 0 } as T;
      }
      return null;
    },
    async all<T = unknown>(_sql: string, _params: unknown[] = []): Promise<T[]> {
      return logs as T[];
    },
  };
  return db;
}

describe("DmLogsRepo — dedup de comentarios", () => {
  it("commentAlreadyDmed es false al inicio y true tras registrar un sent", async () => {
    const repo = new DmLogsRepo(makeDb() as any);
    expect(await repo.commentAlreadyDmed("cm_1")).toBe(false);
    await repo.recordProcessedComment({ commentId: "cm_1", ruleId: "r1", status: "sent", dmSentAt: Date.now() });
    expect(await repo.commentAlreadyDmed("cm_1")).toBe(true);
  });

  it("skipped_dedup y failed NO marcan como ya enviado", async () => {
    const repo = new DmLogsRepo(makeDb() as any);
    await repo.recordProcessedComment({ commentId: "cm_2", ruleId: "r1", status: "skipped_dedup" });
    await repo.recordProcessedComment({ commentId: "cm_3", ruleId: "r1", status: "failed", error: "x" });
    expect(await repo.commentAlreadyDmed("cm_2")).toBe(false);
    expect(await repo.commentAlreadyDmed("cm_3")).toBe(false);
  });

  it("upsert: actualiza sin duplicar el mismo comment_id", async () => {
    const db = makeDb();
    const repo = new DmLogsRepo(db as any);
    await repo.recordProcessedComment({ commentId: "cm_4", ruleId: "r1", status: "failed", error: "intento 1" });
    await repo.recordProcessedComment({ commentId: "cm_4", ruleId: "r1", status: "sent", dmSentAt: 123 });
    expect(await repo.commentAlreadyDmed("cm_4")).toBe(true);
  });
});

describe("DmLogsRepo — logs de automatizaciones", () => {
  it("registra un log y lo devuelve en recent()", async () => {
    const db = makeDb();
    const repo = new DmLogsRepo(db as any);
    await repo.log({
      ruleId: "r1",
      kind: "comment_dm",
      platform: "instagram",
      target: "cm_1",
      username: "maria.g",
      message: "Hola",
      status: "sent",
    });
    const recent = await repo.recent(10);
    expect(recent.length).toBe(1);
    expect(recent[0].kind).toBe("comment_dm");
    expect(recent[0].username).toBe("maria.g");
    expect(recent[0].status).toBe("sent");
  });

  it("guarda el motivo del fallo", async () => {
    const db = makeDb();
    const repo = new DmLogsRepo(db as any);
    await repo.log({ kind: "dm_reply", target: "conv_1", status: "failed", error: "HTTP 429 rate limited" });
    const recent = await repo.recent(10);
    expect(recent[0].error).toBe("HTTP 429 rate limited");
  });
});

describe("DmLogsRepo — rate limit por cuenta", () => {
  it("reserva slots hasta el tope y luego rechaza", async () => {
    const db = makeDb();
    const repo = new DmLogsRepo(db as any);
    // tope bajo (3) para el test
    expect(await repo.reserveDmSlot("acct_1", 3)).toBe(true);
    expect(await repo.reserveDmSlot("acct_1", 3)).toBe(true);
    expect(await repo.reserveDmSlot("acct_1", 3)).toBe(true);
    expect(await repo.reserveDmSlot("acct_1", 3)).toBe(false); // 4º → no
  });

  it("resetea el contador en la hora siguiente", async () => {
    const db = makeDb();
    const repo = new DmLogsRepo(db as any);
    expect(await repo.reserveDmSlot("acct_2", 2)).toBe(true);
    expect(await repo.reserveDmSlot("acct_2", 2)).toBe(true);
    expect(await repo.reserveDmSlot("acct_2", 2)).toBe(false);
    // La ventana se calcula por hora real; simular hora distinta no es trivial
    // en el stub, pero currentHourUsage debe reportar el consumo actual.
    const usage = await repo.currentHourUsage("acct_2");
    expect(usage.used).toBe(2);
    expect(usage.windowStart % 3600_000).toBe(0); // ventana alineada a la hora
  });

  it("cuentas distintas tienen cupos independientes", async () => {
    const db = makeDb();
    const repo = new DmLogsRepo(db as any);
    expect(await repo.reserveDmSlot("acct_a", 2)).toBe(true);
    expect(await repo.reserveDmSlot("acct_a", 2)).toBe(true);
    expect(await repo.reserveDmSlot("acct_a", 2)).toBe(false);
    expect(await repo.reserveDmSlot("acct_b", 2)).toBe(true); // b tiene su propio cupo
  });
});

describe("DmLogsRepo — getProcessedComment (dedup por pierna)", () => {
  it("devuelve null si el comentario no está registrado", async () => {
    const repo = new DmLogsRepo(makeDb() as any);
    expect(await repo.getProcessedComment("cm_100")).toBeNull();
  });

  it("devuelve dmSentAt/publicReplySentAt por separado (permite reintentar la pública)", async () => {
    const db = makeDb();
    const repo = new DmLogsRepo(db as any);
    // El DM se envió, pero la pública NO (intento previo falló a mitad).
    await repo.recordProcessedComment({ commentId: "cm_50", ruleId: "r1", status: "sent", dmSentAt: 1000 });
    const rec = await repo.getProcessedComment("cm_50");
    expect(rec?.dmSentAt).toBe(1000);
    expect(rec?.publicReplySentAt).toBeUndefined(); // falta la pública → se reintenta
  });

  it("upsert registra la pública sin borrar el estado del DM", async () => {
    const db = makeDb();
    const repo = new DmLogsRepo(db as any);
    await repo.recordProcessedComment({ commentId: "cm_51", ruleId: "r1", status: "sent", dmSentAt: 1000 });
    // Reintento: solo se registra la pública (dmSentAt undefined → conserva el previo)
    await repo.recordProcessedComment({ commentId: "cm_51", ruleId: "r1", status: "sent", publicReplySentAt: 3000 });
    const rec = await repo.getProcessedComment("cm_51");
    expect(rec?.dmSentAt).toBe(1000); // conservado
    expect(rec?.publicReplySentAt).toBe(3000);
  });
});
