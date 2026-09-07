// Un "niche pack" personaliza el bot para un giro (restaurante, inmobiliaria…)
// sin forkear el código: BOT_NICHE elige el pack y éste re-etiqueta el dashboard,
// define columnas propias (que viven en lead.metadata JSON), aporta el playbook
// del giro para el prompt y un tono por defecto. Agregar un nicho = un archivo.

export interface NicheColumn {
  /** Llave dentro de lead.metadata (JSON) de donde sale el valor. */
  key: string;
  /** Encabezado que se muestra en la tabla. */
  label: string;
}

/**
 * Extensiones opcionales de un pack. La mayoría de los nichos NO las usan (solo
 * re-etiquetan el panel). Un pack "pesado" como `restaurante` las declara para
 * sumar tools, secciones del panel y el motor de pedidos.
 */
export interface NicheHooks {
  /**
   * Nombres de tools que este pack agrega al agente. `buildTools` las registra
   * solo cuando `BOT_NICHE` coincide con el pack. La tool en sí vive en
   * `src/tools/`.
   */
  extraTools?: string[];
  /**
   * Ítems extra en el nav lateral del panel. La ruta la monta el pack en
   * `src/admin/routes.ts`. `section` = grupo del nav ("Bandeja", "Análisis"…).
   */
  navExtra?: { id: string; label: string; icon: string; href: string; section?: string }[];
  /**
   * El pack usa el motor de pedidos (tablas orders / order_items / order_events
   * de schema.sql). Lo consultan los reportes y la página pública de seguimiento.
   */
  orderEngine?: boolean;
}

export interface NichePack {
  /** id estable = valor de BOT_NICHE (ej. "restaurante"). */
  id: string;
  /** Cómo se llama UN registro capturado (singular/plural) — re-etiqueta "Lead". */
  recordSingular: string;
  recordPlural: string;
  /** Item del nav lateral (reemplaza "Leads"). */
  navLabel: string;
  /** Ícono lucide del nav. */
  navIcon: string;
  /** KPI del Resumen (reemplaza "Leads captados"). */
  kpiLabel: string;
  /**
   * Re-etiqueta los 4 estados canónicos del lead para el pipeline del giro.
   * El enum de la columna `status` NO cambia (new|contacted|sold|lost) — solo
   * su presentación, así no hay migración ni se rompe el handler de estados.
   */
  statusLabels: { new: string; contacted: string; sold: string; lost: string };
  /** Columnas extra que se leen de lead.metadata (JSON), en orden. */
  columns: NicheColumn[];
  /** Playbook del giro que rellena {{NICHO_PLAYBOOK}} en el system prompt. */
  playbook: string;
  /** Tono por defecto si el dueño no eligió uno en el panel. */
  defaultTone: string;
  /** Docs de KB sugeridos para el setup del giro. */
  kbDocs: string[];
  /**
   * Preguntas de la entrevista inicial específicas del giro (además de las
   * genéricas del CLI / skill). Se muestran al configurar el bot.
   */
  interviewQuestions?: string[];
  /** Extensiones del pack (tools, secciones, motor de pedidos). Ver NicheHooks. */
  hooks?: NicheHooks;
}
