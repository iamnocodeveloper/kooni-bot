import { Db } from "./client";

/**
 * Rate-limit del login del panel (§O tarea O5 / hallazgo S5).
 *
 * La página de login propia (`POST /admin/login`) es un blanco más cómodo para
 * fuerza bruta que el diálogo nativo del navegador. Contamos intentos FALLIDOS
 * por IP en una ventana de 15 min (contador en D1, mismo patrón que
 * `dm_rate_limits`). Al superar el tope, se rechaza sin siquiera comprobar la
 * contraseña. Un login correcto limpia el contador de esa IP.
 *
 * Fail-open: si D1 falla, NO se bloquea el login (mejor dejar entrar que dejar
 * fuera al dueño por un problema de infra).
 */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 8;

function windowStart(now = Date.now()): number {
  return Math.floor(now / LOGIN_WINDOW_MS) * LOGIN_WINDOW_MS;
}

export class LoginAttemptsRepo {
  constructor(private readonly db: Db) {}

  /**
   * ¿Esta IP todavía puede intentar? Cuenta los fallos de la ventana actual.
   * Devuelve `retryAfterSeconds` cuando está bloqueada (hasta que abra la
   * próxima ventana).
   */
  async check(ipHash: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const ws = windowStart();
    const row = await this.db.first<{ count: number }>(
      "SELECT count FROM login_attempts WHERE ip_hash = ? AND window_start = ?",
      [ipHash, ws],
    );
    const count = row?.count ?? 0;
    if (count < LOGIN_MAX_ATTEMPTS) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.ceil((ws + LOGIN_WINDOW_MS - Date.now()) / 1000) };
  }

  /** Registra un intento FALLIDO (incremento atómico) y purga ventanas viejas. */
  async recordFailure(ipHash: string): Promise<void> {
    const ws = windowStart();
    const upd = await this.db.run(
      "UPDATE login_attempts SET count = count + 1 WHERE ip_hash = ? AND window_start = ?",
      [ipHash, ws],
    );
    if (upd.meta?.changes !== 1) {
      await this.db.run(
        `INSERT INTO login_attempts (ip_hash, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(ip_hash, window_start) DO UPDATE SET count = count + 1`,
        [ipHash, ws],
      );
    }
    // Limpieza oportunista: ventanas de hace más de 1h ya no sirven.
    await this.db
      .run("DELETE FROM login_attempts WHERE window_start < ?", [ws - 4 * LOGIN_WINDOW_MS])
      .catch(() => {});
  }

  /** Login correcto → borra el contador de esa IP. */
  async clear(ipHash: string): Promise<void> {
    await this.db.run("DELETE FROM login_attempts WHERE ip_hash = ?", [ipHash]);
  }
}

/** SHA-256 hex de la IP (no guardamos IPs en claro). Sync, compatible Workers. */
export function hashIp(ip: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(ip).digest("hex");
}
