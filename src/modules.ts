/**
 * Módulos de pago (Forja+ a la carta) — features premium vendibles por
 * separado (pago único o membresía), además del Pro base.
 *
 * Cómo se activa un módulo en una instalación (cualquiera de estas gana):
 *   1. BOT_TIER=pro en wrangler.toml              → todos los módulos.
 *   2. Licencia KOONI-PRO-... con payload.modules  → solo los listados.
 *      (un código SIN campo modules = licencia legada → TODOS los módulos)
 *   3. Setting module_unlocks (JSON array)         → override del DUEÑO de la
 *      plataforma: activa módulos a mano por instalación sin generar códigos
 *      (se setea directo en D1 o desde el admin de pagos; NO está en el panel
 *      del cliente).
 */
import type { Env } from "./env";
import { Db } from "./db/client";

export interface PaidModule {
  id: string;
  nombre: string;
  descripcion: string;
  /** pago_unico = se compra una vez · membresia = va con el plan recurrente. */
  tipo: "pago_unico" | "membresia";
  /** Tab del panel que desbloquea (si aplica). Ver PRO_ONLY_TABS en config.ts. */
  tab?: string;
}

/** Catálogo de módulos vendibles. Es la fuente de verdad del panel. */
export const PAID_MODULES: PaidModule[] = [
  {
    id: "nightly_report",
    nombre: "Reporte nocturno",
    descripcion: "Resumen del día en tu Telegram o correo cada noche: clientes, leads, ventas calientes y clientes molestos. También puedes preguntarle a tu bot por los números del día.",
    tipo: "pago_unico",
  },
  {
    id: "analista",
    nombre: "Analista IA",
    descripcion: "La IA califica cada conversación: sentimiento, resolución, calidad del bot, temas y ventas que quedaron abiertas.",
    tipo: "membresia",
    tab: "insights",
  },
  {
    id: "metricas",
    nombre: "Métricas del negocio",
    descripcion: "Tablero de métricas y estadísticas de conversaciones y clientes.",
    tipo: "membresia",
    tab: "stats",
  },
  {
    id: "costos",
    nombre: "Costos de IA",
    descripcion: "Cuánto gasta el bot por cliente y por conversación, para controlar el presupuesto.",
    tipo: "membresia",
    tab: "costs",
  },
  {
    id: "mejoras",
    nombre: "Mejoras automáticas",
    descripcion: "El bot detecta huecos de conocimiento y propone mejoras para responder mejor.",
    tipo: "membresia",
    tab: "mejoras",
  },
  {
    id: "campanas",
    nombre: "Campañas",
    descripcion: "Envíos programados de seguimiento y promociones a tus contactos.",
    tipo: "membresia",
    tab: "campanas",
  },
];

/** Setting (D1) con el override del dueño de la plataforma: JSON array de ids. */
export const MODULE_UNLOCKS_SETTING = "module_unlocks";

const MODULE_BY_ID = new Map(PAID_MODULES.map((m) => [m.id, m]));

export function moduleById(id: string): PaidModule | undefined {
  return MODULE_BY_ID.get(id);
}

function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Módulos desbloqueados en esta instalación (tier pro → todos; licencia con
 * modules → los listados; licencia legada sin modules → todos; override del
 * dueño se SUMA a todo lo anterior).
 */
export async function unlockedModules(env: Env): Promise<Set<string>> {
  const out = new Set<string>();
  const all = () => PAID_MODULES.forEach((m) => out.add(m.id));

  if (env.BOT_TIER === "pro") {
    all();
    return out;
  }

  try {
    const { SettingsRepo, SETTING_KEYS } = await import("./db/settings");
    const repo = new SettingsRepo(new Db(env.DB));

    // 1) Override del dueño de la plataforma (activación manual por instalación).
    for (const id of parseJsonList(await repo.get(MODULE_UNLOCKS_SETTING))) {
      if (MODULE_BY_ID.has(id)) out.add(id);
    }

    // 2) Licencia Pro con módulos.
    const code = await repo.get(SETTING_KEYS.proLicense);
    if (code) {
      const { verifyLicenseFor } = await import("./license");
      if (verifyLicenseFor(env, code, { instanceUid: env.BOT_INSTANCE_ID })) {
        const { verifyLicense } = await import("./license");
        const payload = verifyLicense(code, env);
        if (payload) {
          // Licencia legada (sin campo modules) = Pro completo → todos.
          if (payload.modules === undefined) all();
          else for (const id of payload.modules) if (MODULE_BY_ID.has(id)) out.add(id);
        }
      }
    }
  } catch (e) {
    console.warn("[modules] falló la lectura de módulos — fail-open:", e);
  }

  return out;
}

/** ¿Este módulo está desbloqueado? (usado por gates de features y tabs). */
export async function isModuleUnlocked(env: Env, id: string): Promise<boolean> {
  if (!MODULE_BY_ID.has(id)) return true; // módulo desconocido = no gatear
  return (await unlockedModules(env)).has(id);
}
