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
  {
    id: "blindaje",
    nombre: "Blindaje anti-inventos",
    descripcion: "El bot verifica cada respuesta contra tu información real y jamás adivina: si no está seguro, dice \"déjame confirmarlo\" y te lo pasa.",
    tipo: "membresia",
  },
  {
    id: "vigilante",
    nombre: "Vigilante con IA",
    descripcion: "Cada conversación se revisa sola: si un cliente se enoja o una venta se está cayendo, te llega el aviso — el bot sigue atendiendo.",
    tipo: "membresia",
  },
  {
    id: "handoff_smart",
    nombre: "Handoff que sí atina",
    descripcion: "El bot distingue cuándo pasarte el chat de verdad: cliente molesto, queja, factura o lead caliente → te lo entrega con contexto; lo simple lo resuelve solo.",
    tipo: "membresia",
  },
  {
    id: "cazador",
    nombre: "Cazador de ventas",
    descripcion: "El bot le escribe solito al cliente que preguntó y se enfrió: un solo mensaje en tu tono, entre 3 y 20 horas después. Recupera ventas que se iban al olvido.",
    tipo: "membresia",
  },
  {
    id: "oido_vista",
    nombre: "Oído y vista",
    descripcion: "El bot escucha notas de voz (transcribe) y ve fotos (reconoce productos, comprobantes) y responde al tiro. Cero mensajes que se quedan en visto.",
    tipo: "membresia",
  },
  {
    id: "voz_marca",
    nombre: "Voz de marca",
    descripcion: "El bot suena a ti, no a un robot: contesta en el tono del negocio (tú/usted, cercano o formal) en cada mensaje, en cada canal.",
    tipo: "membresia",
  },
  {
    id: "multiidioma",
    nombre: "Multi-idioma",
    descripcion: "Detecta el idioma del cliente y responde en ese idioma: español, inglés o portugués. Un solo bot, cero clientes perdidos por el idioma.",
    tipo: "membresia",
  },
  {
    id: "encuestas",
    nombre: "Encuestas de satisfacción",
    descripcion: "Al cerrar cada conversación pregunta del 1 al 5 cómo le fue. Si la nota es baja, te avisa al instante para que recuperes al cliente.",
    tipo: "membresia",
  },
  {
    id: "reenganche",
    nombre: "Reenganche (recupera no-shows)",
    descripcion: "Si el Cazador ya escribió y el cliente sigue sin contestar, el bot insiste una vez más de 2 a 5 días después, en tu tono. Trae de regreso a los que se enfriaron.",
    tipo: "membresia",
  },
  {
    id: "resenas",
    nombre: "Pide reseñas",
    descripcion: "Cuando el cliente queda contento, el bot le pide la reseña de Google en ese instante, con tu link. Las estrellas llegan solas y tu negocio sube en el mapa.",
    tipo: "membresia",
  },
  {
    id: "cobros",
    nombre: "Cobros por WhatsApp",
    descripcion: "En cuanto el cliente dice que sí, el bot le manda tu link de pago seguro. Nada de transferencias a ciegas ni capturas.",
    tipo: "membresia",
  },
  {
    id: "galeria",
    nombre: "Galería",
    descripcion: "El bot manda fotos, videos y audios de verdad desde tu biblioteca de recursos: productos, menú, antes/después, notas de voz tuyas — en el momento justo.",
    tipo: "membresia",
  },
  {
    id: "web_sync",
    nombre: "Sincronizar sitio web",
    descripcion: "El bot lee páginas de tu sitio (catálogo, inventario, precios) y responde con esa información, actualizada sola cada noche. Requiere una cuenta de scraping (Decodo).",
    tipo: "membresia",
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
 * dueño se SUMA a todo lo anterior). Acepta un snapshot de settings para
 * evitar re-leer la tabla cuando el llamador ya la tiene.
 */
export async function unlockedModules(env: Env, settingsSnapshot?: Record<string, string>): Promise<Set<string>> {
  const out = new Set<string>();
  const all = () => PAID_MODULES.forEach((m) => out.add(m.id));

  try {
    const { SettingsRepo, SETTING_KEYS } = await import("./db/settings");
    const settings = settingsSnapshot ?? (await new SettingsRepo(new Db(env.DB)).all());
    const get = (k: string) => settings[k]?.trim() || undefined;

    // 1) Override del dueño de la plataforma (activación manual por instalación).
    for (const id of parseJsonList(get(MODULE_UNLOCKS_SETTING))) {
      if (MODULE_BY_ID.has(id)) out.add(id);
    }

    // 2) Licencia Pro con módulos.
    const code = get(SETTING_KEYS.proLicense);
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
