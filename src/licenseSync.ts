/**
 * Sync del estado de licencia desde el backend (super admin, InsForge).
 *
 * El worker pregunta su estado real —plan, módulos activos, límites y marca
 * blanca— y lo guarda en D1 (`settings`). Así el super admin controla la
 * instalación SIN redeploy: el cambio se aplica en el siguiente sync.
 *
 * Fail-open por diseño: si el backend no responde, el bot CONSERVA el último
 * estado conocido (nunca se cae por el panel). Con cache de 6 h para no pegarle
 * en cada request.
 */
import type { Env } from "./env";
import { Db } from "./db/client";
import { SettingsRepo, SETTING_KEYS } from "./db/settings";

export interface LicenseOverlay {
  plan: "free" | "pro";
  estado: "activa" | "revocada" | "vencida";
  modules: string[];
  limits: Record<string, number | null>;
  brand: Record<string, string>;
  syncedAt: number;
}

const SYNC_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

/** Base de las edge functions. Explícita, o derivada del host de USAGE_PUSH_URL. */
function apiBase(env: Env): string {
  const explicit = (env.KOONI_API_URL ?? "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const usage = (env.USAGE_PUSH_URL ?? "").trim();
  if (usage) {
    try {
      const u = new URL(usage);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* URL inválida */
    }
  }
  return "";
}

/** Token por instalación (nuevo) o el compartido (legacy). */
function installToken(env: Env): string {
  return (env.KOONI_INSTALL_TOKEN ?? "").trim() || (env.KOONI_REGISTER_TOKEN ?? "").trim();
}

/** Overlay guardado (o null). Nunca lanza. */
export async function readOverlay(env: Env): Promise<LicenseOverlay | null> {
  try {
    const raw = await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.licenseOverlay);
    if (!raw) return null;
    const o = JSON.parse(raw) as LicenseOverlay;
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

/**
 * Trae el estado del backend y lo persiste. `force` salta el cache (para el
 * botón "Sincronizar ahora" y para el sync inmediato tras un deploy).
 */
export async function syncLicenseState(
  env: Env,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; detail?: string }> {
  const base = apiBase(env);
  const uid = (env.BOT_INSTANCE_ID ?? "").trim();
  const tok = installToken(env);
  if (!base) return { ok: false, detail: "KOONI_API_URL no configurada" };
  if (!uid || !tok) return { ok: false, detail: "falta BOT_INSTANCE_ID o token de instalación" };

  const repo = new SettingsRepo(new Db(env.DB));
  if (!opts.force) {
    const prev = await readOverlay(env);
    if (prev?.syncedAt && Date.now() - prev.syncedAt < SYNC_TTL_MS) return { ok: true, detail: "cache" };
  }

  try {
    const res = await fetch(`${base}/estado-licencia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Kooni-Token": tok },
      body: JSON.stringify({ uid }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, detail: `HTTP ${res.status} ${body.slice(0, 120)}` };
    }
    const j = (await res.json().catch(() => ({}))) as Record<string, any>;
    const estado: LicenseOverlay["estado"] =
      j.estado === "revocada" || j.estado === "vencida" ? j.estado : "activa";
    const modules: string[] = Array.isArray(j.modules) ? j.modules.map((x: unknown) => String(x)) : [];
    const overlay: LicenseOverlay = {
      plan: j.plan === "pro" ? "pro" : "free",
      estado,
      modules,
      limits: j.limits && typeof j.limits === "object" ? j.limits : {},
      brand: j.brand && typeof j.brand === "object" ? j.brand : {},
      syncedAt: Date.now(),
    };
    await repo.set(SETTING_KEYS.licenseOverlay, JSON.stringify(overlay));
    // El código firmado solo se guarda si es Pro (reemplaza al pegado a mano).
    await repo.set(SETTING_KEYS.proLicense, overlay.plan === "pro" && typeof j.code === "string" ? j.code : "");
    // Módulos: el overlay manda (array vacío = ninguno desbloqueado).
    await repo.set(SETTING_KEYS.moduleUnlocks, JSON.stringify(modules));
    return { ok: true, detail: overlay.plan };
  } catch (e) {
    return { ok: false, detail: String((e as Error)?.message || e) };
  }
}
