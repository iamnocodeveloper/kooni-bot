import { describe, it, expect, vi, afterEach } from "vitest";
import {
  LoginAttemptsRepo,
  hashIp,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
} from "../../src/db/loginAttempts";
import { Db } from "../../src/db/client";

/** Stub de D1 en memoria para la tabla login_attempts. */
function makeDb() {
  const rows: { ip_hash: string; window_start: number; count: number }[] = [];
  const d1 = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt: any = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async first() {
          if (/SELECT count FROM login_attempts/.test(sql)) {
            const r = rows.find((x) => x.ip_hash === bound[0] && x.window_start === bound[1]);
            return r ? { count: r.count } : null;
          }
          return null;
        },
        async run() {
          if (/UPDATE login_attempts SET count = count \+ 1/.test(sql)) {
            const r = rows.find((x) => x.ip_hash === bound[0] && x.window_start === bound[1]);
            if (r) {
              r.count += 1;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (/INSERT INTO login_attempts/.test(sql)) {
            const r = rows.find((x) => x.ip_hash === bound[0] && x.window_start === bound[1]);
            if (r) r.count += 1;
            else rows.push({ ip_hash: bound[0] as string, window_start: bound[1] as number, count: 1 });
            return { meta: { changes: 1 } };
          }
          if (/DELETE FROM login_attempts WHERE ip_hash = \?/.test(sql)) {
            for (let i = rows.length - 1; i >= 0; i--) if (rows[i].ip_hash === bound[0]) rows.splice(i, 1);
            return { meta: { changes: 1 } };
          }
          if (/DELETE FROM login_attempts WHERE window_start < \?/.test(sql)) {
            for (let i = rows.length - 1; i >= 0; i--) if (rows[i].window_start < (bound[0] as number)) rows.splice(i, 1);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { repo: new LoginAttemptsRepo(new Db(d1)), rows };
}

afterEach(() => vi.useRealTimers());

describe("LoginAttemptsRepo", () => {
  const ip = hashIp("203.0.113.7");

  it("permite hasta LOGIN_MAX_ATTEMPTS fallos y bloquea el siguiente", async () => {
    const { repo } = makeDb();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      expect((await repo.check(ip)).allowed).toBe(true);
      await repo.recordFailure(ip);
    }
    const gate = await repo.check(ip);
    expect(gate.allowed).toBe(false);
    expect(gate.retryAfterSeconds).toBeGreaterThan(0);
    expect(gate.retryAfterSeconds).toBeLessThanOrEqual(LOGIN_WINDOW_MS / 1000);
  });

  it("un login correcto (clear) resetea el contador", async () => {
    const { repo } = makeDb();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) await repo.recordFailure(ip);
    expect((await repo.check(ip)).allowed).toBe(false);
    await repo.clear(ip);
    expect((await repo.check(ip)).allowed).toBe(true);
  });

  it("el bloqueo es por IP — otra IP no se ve afectada", async () => {
    const { repo } = makeDb();
    const other = hashIp("198.51.100.2");
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) await repo.recordFailure(ip);
    expect((await repo.check(ip)).allowed).toBe(false);
    expect((await repo.check(other)).allowed).toBe(true);
  });

  it("al abrir la siguiente ventana de 15 min, la IP vuelve a poder intentar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
    const { repo } = makeDb();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) await repo.recordFailure(ip);
    expect((await repo.check(ip)).allowed).toBe(false);
    vi.setSystemTime(new Date("2026-09-01T12:16:00Z")); // +16 min → ventana nueva
    expect((await repo.check(ip)).allowed).toBe(true);
  });

  it("hashIp no expone la IP en claro y es estable", () => {
    const h = hashIp("203.0.113.7");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203.0.113.7");
    expect(hashIp("203.0.113.7")).toBe(h);
    expect(hashIp("203.0.113.8")).not.toBe(h);
  });
});
