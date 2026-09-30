// Lectura del sitio de la inmobiliaria: descubre las fichas de propiedades, las
// scrapea (con el proveedor de `scrape_provider`: directo → AIsa → Decodo) y las
// convierte en propiedades del store.
//
// Reusa los extractores que ya usa el inventario de autos para el markdown
// (`extractPriceFromText`, `extractImageFromMarkdown`) y agrega la lectura de
// JSON-LD (RealEstateListing / Product / Place / Apartment), que es la fuente
// autoritativa cuando el sitio la trae.
import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { scrapeForDetails } from "../integrations/scraper";
import { aisaConfigured, aisaMap } from "../integrations/aisaScrape";
import { fetchSitemapDirect, looksLikeSitemap } from "../integrations/directFetch";
import { extractImageFromMarkdown } from "./inventory";
import { KbDocsRepo, indexDoc } from "./docs";
import { WebSyncLogRepo } from "../db/webSyncLog";
import {
  buildPropiedadesResumen,
  loadPropiedadStoreFromDb,
  mergePropiedades,
  propertyKey,
  savePropiedadStore,
  type EstatusPropiedad,
  type Moneda,
  type PropiedadImport,
  type PropiedadStore,
  type StoredPropiedad,
} from "./properties";
import { normEstatus, normMoneda, normOperacion, normTipo, parseIntLoose, parseNum } from "./propertiesCsv";

/** Id del doc de resumen en la KB (le da contexto global al bot). */
export const PROPIEDADES_RESUMEN_ID = "propiedades-resumen";

const FICHA_RE =
  /\/(propiedad(es)?|inmuebles?|venta|renta|departamentos?|casas?|deptos?|proyectos?|residencias?|terrenos?)\//i;
const EXCLUDE_RE =
  /(blog|noticias?|contacto|nosotros|aviso|privacidad|t[eé]rminos|pol[ií]tica|agentes?|equipo|about|login|carrito|wp-content|wp-admin|feed|sitemap)/i;

/** ¿La URL parece la ficha de una propiedad? */
export function isPropertyUrl(url: string): boolean {
  if (EXCLUDE_RE.test(url)) return false;
  return FICHA_RE.test(url);
}

/** Descubre URLs de fichas: sitemap directo y, si hace falta, `map` de AIsa. */
export async function discoverPropertyUrls(env: Env, siteUrl: string, max = 300): Promise<{ urls: string[]; source: string }> {
  const out = new Set<string>();
  let source = "directo";
  const origin = (() => {
    try {
      return new URL(siteUrl).origin;
    } catch {
      return siteUrl;
    }
  })();

  if (looksLikeSitemap(siteUrl) || /sitemap/i.test(siteUrl)) {
    const direct = await fetchSitemapDirect(siteUrl, env);
    if (direct.ok && direct.text) {
      for (const m of direct.text.matchAll(/https?:\/\/[^\s)"'<>]+/g)) {
        if (isPropertyUrl(m[0])) out.add(m[0]);
      }
    }
  }

  if (out.size === 0 && (await aisaConfigured(env))) {
    const m = await aisaMap(env, origin, 1000);
    if (m.ok) {
      source = "aisa-map";
      for (const u of m.links) if (isPropertyUrl(u)) out.add(u);
    }
  }

  return { urls: [...out].slice(0, max), source };
}

function abs(base: string, maybe: string): string | null {
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

function titleFromSlug(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const words = decodeURIComponent(last)
      .replace(/\.(html?|php)$/i, "")
      .split(/[-_]+/)
      .filter((w) => w && !/^\d{4}$/.test(w) && !/^[0-9a-f]{8,}$/i.test(w))
      .join(" ")
      .trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : decodeURIComponent(last);
  } catch {
    return url;
  }
}

/** Operación a partir de pistas de la URL/título (venta por defecto si hay precio). */
function operacionFromText(text: string): "venta" | "renta" | null {
  const s = text.toLowerCase();
  if (/\/(renta|rentas|alquiler|arriendo|for-rent)\//.test(s)) return "renta";
  if (/\/(venta|ventas|en-venta|comprar|for-sale)\//.test(s)) return "venta";
  return normOperacion(s);
}

/** Lee el JSON-LD de la ficha (RealEstateListing / Product / Place / Apartment). */
export function parsePropertyFromHtml(html: string, url: string): PropiedadImport | null {
  const title =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] ??
    titleFromSlug(url);
  const ogImage = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? null;

  let precio: number | null = null;
  let moneda: Moneda | null = null;
  let zona: string | null = null;
  let recamaras: number | null = null;
  let banos: number | null = null;
  let m2: number | null = null;
  let imageUrl: string | null = ogImage ? abs(url, ogImage) : null;

  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse((b[1] ?? "").trim());
    } catch {
      continue;
    }
    const nodes: any[] = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      const graph = Array.isArray(node?.["@graph"]) ? node["@graph"] : [node];
      for (const n of graph) {
        const t = String(n?.["@type"] ?? "").toLowerCase();
        if (!/(realestatelisting|product|place|apartment|house|singlefamilyresidence|residence|offer)/.test(t)) continue;
        const offers = Array.isArray(n?.offers) ? n.offers[0] : n?.offers;
        const priceRaw = offers?.price ?? n?.price;
        if (precio === null && priceRaw !== undefined) precio = Number.parseFloat(String(priceRaw).replace(/[^\d.]/g, "")) || null;
        if (!moneda && (offers?.priceCurrency || n?.priceCurrency)) moneda = normMoneda(String(offers?.priceCurrency ?? n?.priceCurrency));
        const loc = n?.address?.addressLocality ?? n?.address?.addressRegion ?? n?.areaServed?.name ?? n?.address?.streetAddress;
        if (!zona && typeof loc === "string") zona = loc.slice(0, 120);
        const rooms = n?.numberOfRooms ?? n?.numberOfBedrooms ?? n?.numberOfRoomsTotal;
        if (recamaras === null && rooms !== undefined) recamaras = parseIntLoose(String(rooms));
        if (banos === null && n?.numberOfBathroomsTotal !== undefined) banos = parseIntLoose(String(n.numberOfBathroomsTotal));
        const size = typeof n?.floorSize === "object" ? n?.floorSize?.value : n?.floorSize;
        if (m2 === null && size !== undefined) m2 = Number.parseFloat(String(size).replace(/[^\d.]/g, "")) || null;
        const img = Array.isArray(n?.image) ? n.image[0] : n?.image;
        if (!imageUrl && typeof img === "string") imageUrl = abs(url, img);
      }
    }
  }

  const finalTitle = (title ?? "").trim();
  if (!finalTitle && precio === null) return null;
  const operacion = operacionFromText(`${url} ${finalTitle}`);
  return {
    key: propertyKey(null, url),
    codigo: null,
    title: finalTitle.slice(0, 200) || titleFromSlug(url),
    operacion,
    tipo: normTipo(finalTitle) ?? null,
    zona,
    precio,
    moneda: moneda ?? (precio !== null ? "MXN" : null),
    recamaras,
    banos,
    estacionamiento: null,
    m2,
    m2Terreno: null,
    estatus: "disponible",
    extras: null,
    requisitos: null,
    listingUrl: url,
    feedUrl: null,
    source: "web",
    imageUrl,
  };
}

/**
 * Precio desde texto libre de una ficha de INMUEBLE. Ojo: el extractor del
 * inventario de autos topa en 500.000 (`extractPriceFromText`), así que un
 * precio de millones se perdería — acá el rango es el de una propiedad.
 * Prioriza el monto etiquetado ("Precio:", "Renta mensual:"); si no hay,
 * toma el mayor monto con $ o moneda explícita.
 */
export function priceFromPropertyText(text: string): number | null {
  const labeled =
    /(?:precio(?:\s*(?:de\s*venta|final))?|price|renta(?:\s*mensual)?|mensualidad|alquiler)\s*[:：=]?\s*\$\s*([\d][\d.,]{3,})/i.exec(
      text,
    );
  const lab = labeled ? parseNum(labeled[1] ?? "") : null;
  if (lab !== null && lab >= 1_000) return lab;

  const amounts: number[] = [];
  const re = /\$\s*([\d][\d.,]{3,})|\b([\d][\d.,]{4,})\s*(mxn|usd|pesos|d[oó]lares)\b/gi;
  for (const m of text.matchAll(re)) {
    const n = parseNum(m[1] ?? m[2] ?? "");
    if (n !== null && n >= 1_000) amounts.push(n);
  }
  if (amounts.length === 0) return null;
  return Math.max(...amounts);
}

/** Lee la ficha desde el markdown (lo que devuelve AIsa). */
export function parsePropertyFromMarkdown(md: string, url: string): PropiedadImport | null {
  if (!md.trim()) return null;
  const head = /^\s*#\s+(.+)$/m.exec(md)?.[1]?.trim();
  const title = (head ?? titleFromSlug(url)).slice(0, 200);

  const precio = priceFromPropertyText(md);
  const moneda = /(usd|us\$|u\$s|d[oó]lares)/i.test(md) ? "USD" : precio !== null ? "MXN" : null;
  const recamaras = /(\d+)\s*(?:rec[áa]maras?|recs?\.?|habitaciones|cuartos|bedrooms?)\b/i.exec(md)?.[1];
  const banos = /(\d+)\s*(?:ba[ñn]os?|bathrooms?)\b/i.exec(md)?.[1];
  const m2 = /(\d{2,5}(?:[.,]\d+)?)\s*(?:m2|m²|mts2|metros?\s*cuadrados?)\b/i.exec(md)?.[1];
  const estac = /(\d+)\s*(?:estacionamientos?|cajones?(?:\s*de\s*estacionamiento)?|autos|parking)\b/i.exec(md)?.[1];
  const zona =
    /(?:colonia|col\.|fraccionamiento|zona|barrio|sector)\s*[:\-–]?\s*([A-ZÁÉÍÓÚÑ][^\n,|]{2,40})/i.exec(md)?.[1]?.trim() ?? null;
  const codigo =
    /(?:c[oó]digo|referencia|ref\.|clave|id)\s*[:\-#]?\s*([A-Za-z0-9][A-Za-z0-9\-]{2,19})\b/i.exec(md)?.[1]?.trim() ?? null;
  const estatus: EstatusPropiedad = normEstatus(
    /(apartad|reservad|vendid|rentad|disponible|sold|pending)/i.exec(md)?.[1] ?? "",
  ) ?? "disponible";
  const img = extractImageFromMarkdown(md);

  if (precio === null && !head) return null;
  return {
    key: propertyKey(codigo, url),
    codigo,
    title: title || titleFromSlug(url),
    operacion: operacionFromText(`${url} ${title}`),
    tipo: normTipo(title) ?? null,
    zona: zona ? zona.slice(0, 120) : null,
    precio,
    moneda,
    recamaras: recamaras ? Number.parseInt(recamaras, 10) : null,
    banos: banos ? Number.parseInt(banos, 10) : null,
    estacionamiento: estac ? Number.parseInt(estac, 10) : null,
    m2: m2 ? Number.parseFloat(m2.replace(",", ".")) : null,
    m2Terreno: null,
    estatus,
    extras: null,
    requisitos: null,
    listingUrl: url,
    feedUrl: null,
    source: "web",
    imageUrl: img ? abs(url, img) : null,
  };
}

/** Parser universal de una ficha. */
export function parsePropertyFromAny(content: string, url: string): PropiedadImport | null {
  if (/<html|<script|<meta/i.test(content.slice(0, 2000))) {
    return parsePropertyFromHtml(content, url) ?? parsePropertyFromMarkdown(content, url);
  }
  return parsePropertyFromMarkdown(content, url);
}

/** Escribe el doc de resumen en la KB (lo usan el sync y el importador CSV). */
export async function buildAndIndexPropiedadesResumen(env: Env, db: Db, store: PropiedadStore): Promise<boolean> {
  const content = buildPropiedadesResumen(store);
  const repo = new KbDocsRepo(db);
  if (!content) {
    await repo.delete(PROPIEDADES_RESUMEN_ID).catch(() => undefined);
    return false;
  }
  await repo.upsert({ id: PROPIEDADES_RESUMEN_ID, title: "Inventario de propiedades", content });
  await indexDoc(env, (await repo.getById(PROPIEDADES_RESUMEN_ID))!);
  return true;
}

export interface PropertiesSyncResult {
  found: number;
  added: number;
  updated: number;
  errors: { url: string; error: string }[];
  source: string;
  scraped: number;
}

/**
 * Corrida completa: descubre fichas en el sitio, las scrapea y actualiza el store.
 * `urls` permite pasar una lista concreta (el importador o el panel).
 */
export async function runPropertiesSync(
  env: Env,
  opts: { urls?: string[]; siteUrl?: string; max?: number } = {},
): Promise<PropertiesSyncResult> {
  const db = new Db(env.DB);
  const max = Math.min(Math.max(opts.max ?? 60, 1), 400);
  const errors: { url: string; error: string }[] = [];
  let source = opts.urls ? "manual" : "directo";
  let urls = opts.urls ?? [];

  if (urls.length === 0) {
    let site = opts.siteUrl ?? "";
    if (!site) {
      const urlsCfg = (await new SettingsRepo(db).get(SETTING_KEYS.webSyncUrls)) ?? "";
      site = urlsCfg
        .split(/[\n,]/)
        .map((s) => s.trim())
        .find(Boolean) ?? "";
    }
    if (!site) return { found: 0, added: 0, updated: 0, errors, source, scraped: 0 };
    const d = await discoverPropertyUrls(env, site, max);
    urls = d.urls;
    source = d.source;
  }

  const incoming: PropiedadImport[] = [];
  let scraped = 0;
  for (const url of urls.slice(0, max)) {
    const r = await scrapeForDetails(env, url, { timeoutMs: 45_000 });
    if (!r.ok || !r.content) {
      errors.push({ url, error: r.error ?? "sin contenido" });
      if (r.code === "quota") {
        errors.push({ url, error: "Se detuvo la corrida: el proveedor de scraping no tiene cuota/saldo." });
        break;
      }
      continue;
    }
    scraped++;
    const p = parsePropertyFromAny(r.content, url);
    if (p) incoming.push(p);
    else errors.push({ url, error: "no se pudo interpretar la ficha" });
  }

  const store = await loadPropiedadStoreFromDb(db);
  const res = mergePropiedades(store, incoming);
  await savePropiedadStore(db, res.store);
  await buildAndIndexPropiedadesResumen(env, db, res.store);

  await new WebSyncLogRepo(db)
    .recordRun({
      trigger: opts.urls ? "manual" : "cron",
      mode: "propiedades",
      url: urls[0],
      vehiclesTotal: Object.keys(res.store.props).length,
      added: res.added,
      changed: res.updated,
      errors: errors.length,
      errorMsg: errors.length ? errors.slice(0, 3).map((e) => `${e.url}: ${e.error}`).join(" | ") : undefined,
      note: `propiedades · fuente ${source} · ${scraped} fichas leídas`,
    })
    .catch(() => undefined);

  return { found: urls.length, added: res.added, updated: res.updated, errors, source, scraped };
}

/**
 * Completa UNA propiedad scrapeando su ficha (foto, precio, zona, m²…). Si ya
 * está completa no gasta credenciales de scraping. La usan `fichaPropiedad`
 * (on-demand) y el lote nocturno.
 */
export async function enrichPropiedad(
  env: Env,
  db: Db,
  key: string,
  opts: { timeoutMs?: number } = {},
): Promise<StoredPropiedad | null> {
  const store = await loadPropiedadStoreFromDb(db);
  const cur = store.props[key];
  if (!cur) return null;
  if (cur.imageUrl && cur.precio !== null && cur.zona) return cur;
  if (!cur.listingUrl) return cur;

  const r = await scrapeForDetails(env, cur.listingUrl, { timeoutMs: opts.timeoutMs ?? 45_000 });
  if (!r.ok || !r.content) return cur;
  const parsed = parsePropertyFromAny(r.content, cur.listingUrl);
  if (!parsed) return cur;

  const next: StoredPropiedad = {
    ...cur,
    operacion: cur.operacion ?? parsed.operacion,
    tipo: cur.tipo ?? parsed.tipo,
    zona: cur.zona ?? parsed.zona,
    precio: cur.precio ?? parsed.precio,
    moneda: cur.moneda ?? parsed.moneda,
    recamaras: cur.recamaras ?? parsed.recamaras,
    banos: cur.banos ?? parsed.banos,
    m2: cur.m2 ?? parsed.m2,
    estatus: parsed.estatus ?? cur.estatus,
    imageUrl: parsed.imageUrl ?? cur.imageUrl,
    imgStatus: parsed.imageUrl ? "ok" : "error",
    imgAt: parsed.imageUrl ? Date.now() : cur.imgAt,
    updatedAt: Date.now(),
  };
  store.props[key] = next;
  await savePropiedadStore(db, store);
  return next;
}

/**
 * Completa la foto (y los datos faltantes) de las propiedades que entraron por
 * CSV con un link. Se corre en el tick nocturno, en lotes.
 */
export async function enrichPendingProperties(env: Env, db: Db, max = 15): Promise<{ done: number; errors: number }> {
  const store = await loadPropiedadStoreFromDb(db);
  const pending = Object.values(store.props)
    .filter((p) => !p.imageUrl && p.listingUrl)
    .slice(0, max);
  let done = 0;
  let errors = 0;
  for (const p of pending) {
    const r = await enrichPropiedad(env, db, p.key).catch(() => null);
    if (r && (r.imageUrl || r.precio !== null)) done++;
    else errors++;
  }
  if (done > 0) {
    await buildAndIndexPropiedadesResumen(env, db, await loadPropiedadStoreFromDb(db));
  }
  return { done, errors };
}
