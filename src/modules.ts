/**
 * Catálogo de funciones "Extras" (Kooni+).
 *
 * MODELO: el free y el Pro tienen el MISMO set de capacidades por defecto; lo
 * que separa a Pro del free son los **límites de cantidad** (`src/limits.ts`).
 *
 * Pero el super admin puede **activar funciones por licencia** desde el panel:
 * escribe `settings.module_unlocks` (vía `syncLicenseState`) y `unlockedModules()`
 * desbloquea exactamente esos ids. Sin `module_unlocks` seteado → todo abierto
 * (retrocompat con las instalaciones que existían antes de este modelo).
 *
 * Este array es la fuente de verdad de las etiquetas/descripciones del panel.
 */
import type { Env } from "./env";
import { Db } from "./db/client";
import { SettingsRepo, SETTING_KEYS } from "./db/settings";

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
    id: "auditoria",
    nombre: "Registro de auditoría",
    descripcion: "Ventana de solo lectura con cada acción del panel: quién entró, a qué hora, qué modificó y el valor anterior vs. el nuevo. Para auditar a tu equipo.",
    tipo: "membresia",
    tab: "auditoria",
  },
  {
    id: "web_sync",
    nombre: "Sincronizar sitio web",
    descripcion: "El bot lee páginas de tu sitio (catálogo, inventario, precios) y responde con esa información, actualizada sola cada noche. Requiere una cuenta de scraping (Decodo).",
    tipo: "membresia",
  },
];

const ALL_MODULE_IDS: readonly string[] = PAID_MODULES.map((m) => m.id);

/**
 * Módulos desbloqueados en esta instalación.
 *
 * - `settings.module_unlocks` AUSENTE o vacío → **TODOS** (retrocompat: las
 *   instalaciones viejas, y el modo "todo incluido" que rigió hasta 2026-09-07).
 * - `module_unlocks` PRESENTE (aunque sea `[]`) → **exactamente esos ids**. Es lo
 *   que escribe el backend de licencias (`syncLicenseState`) cuando el super
 *   admin activa funciones por licencia.
 * - Fail-open: si el valor no se puede leer/parsear, se devuelven todos.
 */
export async function unlockedModules(
  env: Env,
  settingsSnapshot?: Record<string, string>,
): Promise<Set<string>> {
  try {
    const snapshot =
      settingsSnapshot ??
      ((await new SettingsRepo(new Db(env.DB)).all()) as Record<string, string>);
    const raw = snapshot[SETTING_KEYS.moduleUnlocks];
    if (raw == null || String(raw).trim() === "") return new Set(ALL_MODULE_IDS);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((x) => String(x)).filter((id) => ALL_MODULE_IDS.includes(id)));
    }
  } catch {
    // sin D1 o valor inválido → todo desbloqueado (fail-open)
  }
  return new Set(ALL_MODULE_IDS);
}

/** ¿Este módulo está desbloqueado? (ver `unlockedModules`). */
export async function isModuleUnlocked(env: Env, id: string): Promise<boolean> {
  return (await unlockedModules(env)).has(id);
}
