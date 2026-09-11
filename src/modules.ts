/**
 * Catálogo de funciones "Extras" (Kooni+).
 *
 * MODELO (2026-09-07): **todas las funciones están disponibles en TODOS los
 * planes.** No hay paywall por feature — el free y el Pro tienen exactamente el
 * mismo set de capacidades. Lo único que separa a Pro del free son los
 * **límites de cantidad** (contactos, mensajes/mes, canales…) en `src/limits.ts`.
 *
 * Este array sigue siendo la fuente de verdad de las etiquetas/descripciones que
 * el panel muestra en el menú Extras; el dueño activa o apaga cada función con
 * su propio toggle. `unlockedModules()` / `isModuleUnlocked()` devuelven SIEMPRE
 * "todo desbloqueado" — quedaron como no-ops para no tocar los ~15 llamadores.
 */
import type { Env } from "./env";

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
 * Módulos desbloqueados en esta instalación. MODELO ACTUAL: **todos, siempre**
 * — no hay paywall por feature; lo que separa free de Pro son los límites de
 * cantidad (`src/limits.ts`). Se mantiene `async` y la firma para no tocar los
 * llamadores. `_env`/`_settings` quedan sin usar a propósito.
 */
export async function unlockedModules(
  _env: Env,
  _settingsSnapshot?: Record<string, string>,
): Promise<Set<string>> {
  return new Set(ALL_MODULE_IDS);
}

/** ¿Este módulo está desbloqueado? Siempre sí (ver `unlockedModules`). */
export async function isModuleUnlocked(_env: Env, _id: string): Promise<boolean> {
  return true;
}
