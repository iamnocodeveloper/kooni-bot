/**
 * Zona horaria del NEGOCIO — una sola fuente de verdad.
 *
 * Antes había tres orígenes que se podían desincronizar:
 *   - el reloj del bot  → `env.CALCOM_TIMEZONE` (con fallback hardcodeado),
 *   - la agenda Cal.com → la misma var,
 *   - las fechas del panel → `member/config.local.ts`.
 * Resultado real: el negocio está en West Palm Beach (Florida) y el bot pensaba
 * en hora de Ciudad de México — dos horas de desfase al interpretar "hoy",
 * "mañana" o al pedir horarios de cita.
 *
 * Ahora manda el setting `business_timezone` del panel y todos leen de acá.
 * Una zona inválida se IGNORA (mejor el default que romper las citas).
 */
import type { Env } from "./env";
import { Db } from "./db/client";
import { SettingsRepo, SETTING_KEYS } from "./db/settings";

export const DEFAULT_BUSINESS_TZ = "America/Mexico_City";

/** Zonas ofrecidas en el panel: evita typos que romperían las citas. */
export const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Monterrey",
  "America/Tijuana",
  "America/Panama",
  "America/Costa_Rica",
  "America/Santo_Domingo",
  "America/Bogota",
  "America/Lima",
  "America/Guayaquil",
  "America/Caracas",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "Europe/Madrid",
  "UTC",
];

/** ¿Es una zona IANA válida? `Intl` lanza si no lo es. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Zona efectiva del negocio. Precedencia:
 *   1. setting `business_timezone` (panel) — si es válida
 *   2. `env.CALCOM_TIMEZONE` (legacy, instalaciones previas)
 *   3. default
 */
export function resolveBusinessTimezone(
  settings: Record<string, string>,
  env: Pick<Env, "CALCOM_TIMEZONE">,
): string {
  const fromPanel = (settings[SETTING_KEYS.businessTimezone] ?? "").trim();
  if (fromPanel && isValidTimeZone(fromPanel)) return fromPanel;
  const legacy = (env.CALCOM_TIMEZONE ?? "").trim();
  if (legacy && isValidTimeZone(legacy)) return legacy;
  return DEFAULT_BUSINESS_TZ;
}

/** Igual que `resolveBusinessTimezone` pero leyendo los settings de D1. */
export async function resolveTimezoneFromEnv(env: Env): Promise<string> {
  try {
    const settings = await new SettingsRepo(new Db(env.DB)).all();
    return resolveBusinessTimezone(settings, env);
  } catch {
    return resolveBusinessTimezone({}, env);
  }
}

/** "UTC-04:00" / "UTC+02:00" para la zona y el momento dados. */
function offsetLabel(tz: string, now: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!part) return "";
    if (part === "GMT") return "UTC+00:00";
    return /^GMT[+-]/.test(part) ? part.replace(/^GMT/, "UTC") : "";
  } catch {
    return "";
  }
}

export interface NowInTz {
  /**
   * Fecha larga legible + ISO + zona, SIN hora. Deliberadamente estable durante
   * todo el día: va dentro del prompt grande, y si cambiara cada minuto el
   * prefijo no sería cacheable por OpenAI (se re-pagaría el prompt entero en
   * cada turno).
   */
  dateLine: string;
  /** Hora exacta + offset. Va en su propio bloque de sistema, por turno. */
  timeLine: string;
}

export function nowInTz(tz: string, now: Date = new Date()): NowInTz {
  const dateLong = new Intl.DateTimeFormat("es-MX", { timeZone: tz, dateStyle: "full" }).format(now);
  const dateISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // h23 evita el "24:00" que algunas runtimes devuelven para medianoche.
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const off = offsetLabel(tz, now);
  return {
    dateLine: `${dateLong} (fecha ISO: ${dateISO}, zona horaria: ${tz})`,
    timeLine: `${hm}${off ? ` (${off})` : ""}`,
  };
}
