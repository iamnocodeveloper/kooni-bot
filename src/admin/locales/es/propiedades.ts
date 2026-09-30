// Área: Propiedades (giro inmobiliaria). Claves `props.*` para la vista
// /admin/propiedades (inventario de propiedades, import de CSV/Excel y lectura
// del sitio de la inmobiliaria).
//
// El ESPAÑOL es la fuente de verdad: cada valor es el texto visible del panel y
// los placeholders (`{total}`, `{n}`, `{source}`…) los sustituye `t(key, vars)`.
export const propiedadesEs = {
  // ── Ítem del sidebar (navExtra del pack) ───────────────────────────────────
  // `layout.ts` pinta los ítems que aporta el pack por su id (`nav.<id>`), así
  // que esta clave es la que hace que el menú diga "Propiedades" y no el id.
  "nav.propiedades": "Propiedades",

  // ── Página + KPIs ──────────────────────────────────────────────────────────
  "props.title": "Propiedades",
  "props.subtitle": "Todas las propiedades que el bot tiene cargadas ({total}). Importá tu CSV o leé el sitio para llenarlo.",
  "props.kpi.total": "Propiedades",
  "props.kpi.venta": "En venta",
  "props.kpi.renta": "En renta",
  "props.kpi.noPrice": "Sin precio",
  "props.kpi.noPhoto": "Sin foto",

  // ── Filtros + buscador ─────────────────────────────────────────────────────
  "props.filter.all": "Todas",
  "props.filter.venta": "Venta",
  "props.filter.renta": "Renta",
  "props.filter.noPrice": "Sin precio",
  "props.filter.noPhoto": "Sin foto",
  "props.search.placeholder": "Buscar por título, referencia, zona…",
  "props.search.submit": "Buscar",

  // ── Tabla ──────────────────────────────────────────────────────────────────
  "props.col.ref": "Referencia",
  "props.col.title": "Título",
  "props.col.operacion": "Operación",
  "props.col.tipo": "Tipo",
  "props.col.zona": "Zona",
  "props.col.precio": "Precio",
  "props.col.recamaras": "Recámaras",
  "props.col.banos": "Baños",
  "props.col.m2": "m²",
  "props.col.estatus": "Estatus",
  "props.col.foto": "Foto",
  "props.col.link": "Link",
  "props.photo.ok": "con foto",
  "props.photo.pending": "pendiente",
  "props.photo.error": "sin foto",
  "props.open": "abrir ↗",
  "props.empty": "Todavía no hay propiedades cargadas. Pegá tu CSV abajo y el bot empieza a mostrarlas.",
  "props.empty.filter": "No hay propiedades con este filtro.",
  "props.page.prev": "← Anterior",
  "props.page.next": "Siguiente →",
  "props.page.info": "Página {page} de {pages}",

  // ── Importar CSV/Excel ─────────────────────────────────────────────────────
  "props.import.title": "Importar propiedades",
  "props.import.help": "Pegá tu CSV (una fila por propiedad) o elegí un archivo. También acepta pegado directo desde Excel (tabulado) y, sin encabezados, el orden canónico de columnas.",
  "props.import.headerLabel": "Encabezado esperado:",
  "props.import.placeholder": "titulo,operacion,tipo,zona,precio,moneda,recamaras,banos,m2,estatus,referencia,link,imagen",
  "props.import.file": "Elegir archivo",
  "props.import.submit": "Importar",

  // ── Leer el sitio web ──────────────────────────────────────────────────────
  "props.sync.title": "Leer el sitio web",
  "props.sync.help": "Usa el proveedor de scraping configurado (AIsa/Decodo) y trae precio, zona y foto de cada ficha.",
  "props.sync.sitePlaceholder": "https://mi-inmobiliaria.com",
  "props.sync.submit": "Leer sitio ahora",

  // ── Mensajes (flash) ───────────────────────────────────────────────────────
  "props.msg.saved": "✓ Guardado.",
  "props.msg.importOk": "✓ {n} propiedades importadas ({updated} actualizadas, {errors} con error)",
  "props.msg.importEmpty": "No pegaste nada: pegá tu CSV o elegí un archivo.",
  "props.msg.syncOk": "{scraped} fichas leídas, {added} nuevas, {updated} actualizadas, {errors} errores (fuente: {source})",
  "props.msg.syncEmpty": "No encontré fichas en ese sitio: revisá la URL.",
} as const;
