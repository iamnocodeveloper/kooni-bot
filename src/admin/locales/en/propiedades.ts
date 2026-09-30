import type { propiedadesEs } from "../es/propiedades";

/** Área: Propiedades (giro inmobiliaria). Claves `props.*`.
 *  El tipo obliga a cubrir EXACTAMENTE las claves del ES (ni una más, ni una
 *  menos): si se agrega una clave en `es/propiedades.ts` y falta acá, es error
 *  de compilación. Los placeholders (`{total}`, `{n}`, `{source}`…) se copian
 *  tal cual. */
export const propiedadesEn: Record<keyof typeof propiedadesEs, string> = {
  // ── Sidebar item (pack navExtra) ───────────────────────────────────────────
  "nav.propiedades": "Properties",

  // ── Page + KPIs ────────────────────────────────────────────────────────────
  "props.title": "Properties",
  "props.subtitle": "Every property the bot has loaded ({total}). Import your CSV or read the site to fill it.",
  "props.kpi.total": "Properties",
  "props.kpi.venta": "For sale",
  "props.kpi.renta": "For rent",
  "props.kpi.noPrice": "No price",
  "props.kpi.noPhoto": "No photo",

  // ── Filters + search ───────────────────────────────────────────────────────
  "props.filter.all": "All",
  "props.filter.venta": "For sale",
  "props.filter.renta": "For rent",
  "props.filter.noPrice": "No price",
  "props.filter.noPhoto": "No photo",
  "props.search.placeholder": "Search by title, reference, zone…",
  "props.search.submit": "Search",

  // ── Table ──────────────────────────────────────────────────────────────────
  "props.col.ref": "Reference",
  "props.col.title": "Title",
  "props.col.operacion": "Operation",
  "props.col.tipo": "Type",
  "props.col.zona": "Zone",
  "props.col.precio": "Price",
  "props.col.recamaras": "Bedrooms",
  "props.col.banos": "Bathrooms",
  "props.col.m2": "m²",
  "props.col.estatus": "Status",
  "props.col.foto": "Photo",
  "props.col.link": "Link",
  "props.photo.ok": "with photo",
  "props.photo.pending": "pending",
  "props.photo.error": "no photo",
  "props.open": "open ↗",
  "props.empty": "No properties loaded yet. Paste your CSV below and the bot starts showing them.",
  "props.empty.filter": "No properties match this filter.",
  "props.page.prev": "← Previous",
  "props.page.next": "Next →",
  "props.page.info": "Page {page} of {pages}",

  // ── Import CSV/Excel ───────────────────────────────────────────────────────
  "props.import.title": "Import properties",
  "props.import.help": "Paste your CSV (one row per property) or pick a file. It also accepts a direct paste from Excel (tabbed) and, with no headers, the canonical column order.",
  "props.import.headerLabel": "Expected header:",
  "props.import.placeholder": "titulo,operacion,tipo,zona,precio,moneda,recamaras,banos,m2,estatus,referencia,link,imagen",
  "props.import.file": "Choose file",
  "props.import.submit": "Import",

  // ── Read the website ───────────────────────────────────────────────────────
  "props.sync.title": "Read the website",
  "props.sync.help": "Uses the configured scraping provider (AIsa/Decodo) and pulls price, zone and photo from each listing.",
  "props.sync.sitePlaceholder": "https://my-real-estate.com",
  "props.sync.submit": "Read site now",

  // ── Flash messages ─────────────────────────────────────────────────────────
  "props.msg.saved": "✓ Saved.",
  "props.msg.importOk": "✓ {n} properties imported ({updated} updated, {errors} with errors)",
  "props.msg.importEmpty": "You pasted nothing: paste your CSV or choose a file.",
  "props.msg.syncOk": "{scraped} listings read, {added} new, {updated} updated, {errors} errors (source: {source})",
  "props.msg.syncEmpty": "No listings found on that site: check the URL.",
};
