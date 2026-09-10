// Inventario estructurado para Web Sync — el "modo inventario" del pipeline.
//
// Cuando la página scrapeada parece un listado de vehículos (feed /llm/inventory/
// de concesionarios), en vez de guardar un blob de texto sin estructura se:
//   1. parsea cada auto (VIN, título, precio, millas, condición, URL de la ficha),
//   2. persiste el store en settings (`web_sync_vehicles`, D1 — sin migración),
//   3. escribe docs de KB compactos SIN links (regla v1.25: nada de links en la
//      lista) + un doc "resumen" con las marcas reales y reglas anti-alucinación.
//
// El store alimenta dos tools del agente:
//   - inventarioQuery → el bot contesta SOLO con lo que hay (marcas exactas),
//   - fichaAuto → link real de la ficha + foto (og:image) solo cuando el cliente
//     pide ESE auto o da su VIN.
// La foto del feed NO existe: se scrapea la página de ficha de cada auto con
// Decodo (marcdown con imágenes, o HTML para leer og:image).
import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { scrapeUrl } from "../integrations/decodo";

/** Un auto tal como sale del parseo del feed (sin estado de foto). */
export interface Vehicle {
  /** Clave estable: `vin:<VIN>` o `url:<hash de la ficha>`. */
  key: string;
  vin: string | null;
  /** Título legible: "2022 Kia Telluride SX". */
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  /** Normalizado a español: "Nuevo" | "Usado" | "Certificado". */
  condition: string | null;
  price: number | null;
  miles: number | null;
  /** URL de la página de ficha del auto (de donde sale el link real y la foto). */
  listingUrl: string | null;
  /** URL del feed de donde salió (para limpiar autos si se quita la URL). */
  feedUrl: string;
}

export interface StoredVehicle extends Vehicle {
  imageUrl: string | null;
  imgStatus: "ok" | "pendiente" | "error";
  imgAt: number | null;
  /** Epoch ms en que el auto entró o cambió por última vez. */
  changedAt: number;
}

export interface VehicleStore {
  updatedAt: number;
  vehicles: Record<string, StoredVehicle>;
}

// ---------------------------------------------------------------------------
// Parser del feed
// ---------------------------------------------------------------------------

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/** Títulos de link que NO son una ficha de auto (nav, CTAs repetidos). */
const GENERIC_LINKS = new Set([
  "home", "all inventory", "our inventory", "our vehicles", "inventory", "new inventory",
  "used inventory", "certified inventory", "specials", "showroom", "view full listing",
  "view listing", "view details", "learn more", "read more", "more info", "details",
  "contact us", "contact", "directions", "get directions", "schedule", "hours",
  "our location", "about us", "dealer info", "connect with us", "search", "back to results",
]);

const VIN_RE = /\bVIN[:#]?\s*([A-HJ-NPR-Z0-9]{11,17})\b/i;
const PRICE_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d{4,})/;
const MILES_RE = /([\d,]{2,})\s*(?:miles|mi\.?)\b/i;
const CONDITION_RE = /\b(Pre-Owned|Certified|Used|New)\b/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;

export function conditionToEs(raw: string | null): string | null {
  if (!raw) return null;
  const c = raw.toLowerCase();
  if (c.includes("certified")) return "Certificado";
  if (c.includes("pre-owned") || c.includes("used") || c.includes("pre owned")) return "Usado";
  if (c.includes("new")) return "Nuevo";
  return null;
}

function looksGenericLink(title: string): boolean {
  const t = title.toLowerCase().replace(/[→➔»]+/g, "").trim();
  return GENERIC_LINKS.has(t) || t.length === 0;
}

function absUrl(base: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/** Título de un vehículo desde el texto de un link o del bloque (sin markdown). */
function vehicleTitleFrom(text: string): string | null {
  const cleaned = text
    .replace(/[*_`]/g, "")
    .replace(/^[#>\s-]+/, "")
    .replace(/\s*[→➔»]\s*$/, "")
    .trim();
  if (!cleaned) return null;
  // Debe verse como un auto: "2022 Kia Telluride" o al menos una marca conocida.
  if (YEAR_RE.test(cleaned)) return cleaned;
  return null;
}

/**
 * Parte el markdown en bloques de "una entrada". Cada entrada empieza con un
 * bullet a columna 0-2 (`- ` / `* `) o un heading h2-h4 (`### `). Las líneas
 * siguientes (incluyendo bullets indentados) son la continuación de esa entrada.
 */
export function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) {
      blocks.push(cur.join("\n"));
      cur = [];
    }
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+$/g, "");
    const startsEntry = /^ {0,2}[-*]\s+/.test(line) || /^#{2,4}\s+/.test(line);
    if (startsEntry) {
      flush();
      cur.push(line);
    } else if (cur.length) {
      cur.push(line);
    }
  }
  flush();
  return blocks;
}

/** Hash rápido djb2 (mismo que webSync) para claves sin VIN. */
export function quickHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function vehicleKey(vin: string | null, listingUrl: string | null): string {
  if (vin && vin.length >= 11) return `vin:${vin}`;
  if (listingUrl) return `url:${quickHash(listingUrl)}`;
  return `url:${quickHash("sin-link")}`;
}

function parseBlock(block: string, feedUrl: string): Vehicle | null {
  // Cuerpo SIN sintaxis markdown para escanear campos: las URLs suelen
  // contener palabras (used/new/certified) que ensuciarían precio/condición.
  const body = block.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/!\[([^\]]*)\]/g, " $1 ");

  let vin: string | null = null;
  const vinM = VIN_RE.exec(body);
  if (vinM) vin = vinM[1].toUpperCase();

  // El link de la ficha es el que trae el título del auto (texto NO genérico).
  // Los CTAs "View Full Listing"/"View Details" apuntan a la ficha pero no
  // traen título; se usan de fallback SOLO si el título viene de un heading y
  // no de un link. Nunca tomar un link de navegación como ficha del auto.
  let listingUrl: string | null = null;
  let linkTitle: string | null = null;
  let fallbackUrl: string | null = null;
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(block))) {
    const title = m[1].trim();
    const url = absUrl(feedUrl, m[2].trim());
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    // Links de navegación a la raíz / imágenes no son fichas.
    if (u.pathname.length <= 1 || /\.(jpg|jpeg|png|webp|svg|gif)$/i.test(u.pathname)) continue;
    if (fallbackUrl === null) fallbackUrl = url;
    if (!looksGenericLink(title)) {
      linkTitle = title;
      listingUrl = url;
      break; // el título del auto y su ficha están en el MISMO link
    }
  }
  if (listingUrl === null) listingUrl = fallbackUrl;

  // Título: el del link de la ficha, o la primera línea con pinta de auto.
  let title = linkTitle ? vehicleTitleFrom(linkTitle) : null;
  if (!title) {
    const firstLine = vehicleTitleFrom(block.split("\n")[0] ?? "");
    if (firstLine && !looksGenericLink(firstLine)) title = firstLine;
  }
  if (!title && vin) title = `Auto VIN ${vin}`;
  if (!title) return null;

  const yearM = YEAR_RE.exec(title);
  const year = yearM ? Number(yearM[0]) : null;
  const noYear = year ? title.replace(YEAR_RE, "").trim() : title;
  const words = noYear.split(/\s+/).filter(Boolean);
  const make = words[0] ?? null;
  const model = words.length > 1 ? words.slice(1).join(" ") : null;

  const priceM = PRICE_RE.exec(body);
  const price = priceM ? Number(priceM[1].replace(/,/g, "")) : null;
  const milesM = MILES_RE.exec(body);
  const miles = milesM ? Number(milesM[1].replace(/,/g, "")) : null;
  const condM = CONDITION_RE.exec(body);
  const condition = conditionToEs(condM ? condM[1] : null);

  const hasRealIdentity = !!vin || (price !== null && year !== null);
  if (!hasRealIdentity) return null;

  return {
    key: vehicleKey(vin, listingUrl),
    vin,
    title,
    year,
    make,
    model,
    condition,
    price,
    miles,
    listingUrl,
    feedUrl,
  };
}

/**
 * Parsea el contenido scrapeado de una página de inventario. Devuelve la lista
 * de autos, o `[]` si el contenido no parece un listado (para que el pipeline
 * caiga al modo legacy de texto plano). Heurística tolerante: hasta 100 autos.
 */
export function parseInventory(text: string, feedUrl: string): Vehicle[] {
  const seen = new Set<string>();
  const out: Vehicle[] = [];
  for (const block of splitBlocks(text)) {
    if (out.length >= 120) break;
    const v = parseBlock(block, feedUrl);
    if (!v) continue;
    if (seen.has(v.key)) continue;
    seen.add(v.key);
    out.push(v);
  }
  // Orden estable para que el hash del doc no cambie si el sitio reordena.
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

/** ¿El contenido parseado califica como inventario (≥3 autos con identidad)? */
export function looksLikeInventory(vehicles: Vehicle[]): boolean {
  const real = vehicles.filter(
    (v) => v.vin || (v.price !== null && v.year !== null && v.listingUrl),
  );
  return real.length >= 3;
}

// ---------------------------------------------------------------------------
// Fuente DealerInspire: sitemap de inventario
// ---------------------------------------------------------------------------
//
// El feed `/llm/inventory/` de DealerInspire dejó de existir (hoy sirve la
// homepage), así que el "modo inventario" se alimenta del sitemap de inventario
// del propio sitio: `/dealer-inspire-inventory/inventory_sitemap`.
//
// Ese sitemap lista TODAS las fichas y cada URL trae la ficha codificada:
//   /inventory/<condición>-<año>-<marca>-<modelo>-<trim>-<carrocería>-<VIN>/
// Ej.: /inventory/certified-used-2023-kia-sorento-sx-awd-4d-sport-utility-5xyrkdlf7pg242135/
// De ahí salen condición, año, marca, modelo, VIN y el LINK real de la ficha.
// Precio/millas/foto no vienen en el sitemap: se completan scrapeando la ficha
// con Decodo (ver refreshVehicleImages / fetchVehicleImage).

const VIN_TOKEN_RE = /^[a-hj-npr-z0-9]{17}$/i;
const YEAR_TOKEN_RE = /^(19|20)\d{2}$/;

/** Tokens de carrocería que se recortan del final del slug (no son modelo/trim). */
const BODY_TOKENS = new Set([
  "4d", "2d", "4dr", "2dr", "sport", "utility", "sedan", "supercrew", "crew",
  "cab", "hatchback", "coupe", "convertible", "wagon", "minivan", "van",
  "pickup", "truck", "suv", "mpv", "cuv", "passenger", "cargo",
]);

/** Siglas/trims que van en mayúsculas al reconstruir el título. */
const UPPER_TOKENS = new Set([
  "awd", "fwd", "rwd", "2wd", "4wd", "4x4", "sx", "ex", "lx", "gt", "le",
  "se", "sel", "xle", "xse", "srt", "trd", "ltz", "lt", "ls", "exl", "dct",
  "cvt", "phev", "ev", "gdi", "x", "s", "l",
]);

function prettyToken(t: string): string {
  if (!t) return t;
  if (UPPER_TOKENS.has(t) || /\d/.test(t) || t.length <= 2) return t.toUpperCase();
  return t[0].toUpperCase() + t.slice(1);
}

function prettyWords(tokens: string[]): string {
  return tokens.filter(Boolean).map(prettyToken).join(" ");
}

/** Construye un Vehicle desde un slug de ficha DealerInspire. null si no parsea. */
export function vehicleFromSlug(slug: string, listingUrl: string, feedUrl: string): Vehicle | null {
  const tokens = slug.toLowerCase().split("-").filter(Boolean);
  if (tokens.length < 3) return null;

  // VIN: último token (17 chars, sin I/O/Q).
  let vin: string | null = null;
  const last = tokens[tokens.length - 1] ?? "";
  if (VIN_TOKEN_RE.test(last)) vin = tokens.pop()!.toUpperCase();

  // Condición al frente.
  let condition: string | null = null;
  if (tokens[0] === "certified" && (tokens[1] === "used" || tokens[1] === "pre-owned")) {
    condition = "Certificado";
    tokens.splice(0, 2);
  } else if (tokens[0] === "certified") {
    condition = "Certificado";
    tokens.shift();
  } else if (tokens[0] === "used" || tokens[0] === "pre-owned") {
    condition = "Usado";
    tokens.shift();
  } else if (tokens[0] === "new") {
    condition = "Nuevo";
    tokens.shift();
  }

  // Año.
  let year: number | null = null;
  if (YEAR_TOKEN_RE.test(tokens[0] ?? "")) year = Number(tokens.shift());

  // Identidad mínima: VIN o año. Sin ninguna de las dos no es una ficha real.
  if (!vin && year === null) return null;

  const makeRaw = tokens.shift() ?? "";
  // Recorta carrocería del final (queda modelo + trim + tracción).
  while (tokens.length > 0 && BODY_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();

  const make = makeRaw ? prettyToken(makeRaw) : null;
  const modelTokens = tokens.filter((t) => !BODY_TOKENS.has(t));
  const model = modelTokens.length ? prettyWords(modelTokens) : null;
  const title = [year ?? undefined, make, model].filter(Boolean).join(" ").trim();
  if (!title) return null;

  return {
    key: vehicleKey(vin, listingUrl),
    vin,
    title,
    year,
    make,
    model,
    condition,
    price: null,
    miles: null,
    listingUrl,
    feedUrl,
  };
}

/**
 * Parsea un sitemap de inventario DealerInspire (XML crudo o su render en
 * Markdown): saca todas las URLs `/inventory/<slug>/` y arma un Vehicle por
 * ficha. Dedup por URL y orden estable.
 */
export function parseDealerInventorySitemap(content: string, feedUrl: string): Vehicle[] {
  const re = /(https?:\/\/[^\s)\]"'<>]*?)\/inventory\/([a-z0-9][a-z0-9-]*)\/?/gi;
  const seen = new Set<string>();
  const out: Vehicle[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const base = m[1];
    const slug = m[2];
    const url = `${base}/inventory/${slug}/`;
    if (seen.has(url)) continue;
    seen.add(url);
    const v = vehicleFromSlug(slug, url, feedUrl);
    if (v) out.push(v);
    if (out.length >= 1000) break;
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

/**
 * Parser universal del pipeline: si el contenido parece un sitemap de fichas
 * (muchas URLs `/inventory/`), usa el parser de sitemap; si no, el parser del
 * feed (markdown con título/precio/millas/VIN).
 */
export function parseInventoryFromAny(content: string, feedUrl: string): Vehicle[] {
  const invHits = content.match(/\/inventory\//g)?.length ?? 0;
  const sitemapish = invHits >= 8 || /<urlset|<loc>/i.test(content);
  if (sitemapish) {
    const vs = parseDealerInventorySitemap(content, feedUrl);
    if (looksLikeInventory(vs)) return vs;
  }
  return parseInventory(content, feedUrl);
}

// ---------------------------------------------------------------------------
// Render a docs de KB (sin links — regla v1.25) + doc resumen
// ---------------------------------------------------------------------------

export function renderVehicleBlock(v: Vehicle): string {
  const parts = [v.title];
  if (v.condition) parts.push(v.condition);
  if (v.miles !== null) parts.push(`${v.miles.toLocaleString("en-US")} millas`);
  if (v.price !== null) parts.push(`$${v.price.toLocaleString("en-US")}`);
  if (v.vin) parts.push(`VIN ${v.vin}`);
  return parts.join(" · ");
}

/**
 * Empaqueta los autos en hasta `maxParts` bloques de ≤ `maxChars` sin partir un
 * auto a la mitad (para que los chunks de Vectorize no corten una ficha).
 */
export function renderInventoryParts(
  vehicles: Vehicle[],
  maxChars: number,
  maxParts: number,
): string[] {
  const parts: string[] = [];
  let cur = "";
  const pushCur = () => {
    if (cur.trim()) parts.push(cur.trim());
    cur = "";
  };
  for (const v of vehicles) {
    const b = renderVehicleBlock(v);
    if (b.length > maxChars) continue; // ficha anómala — no entra en ningún doc
    if (parts.length >= maxParts) break;
    const candidate = cur ? `${cur}\n\n${b}` : b;
    if (candidate.length > maxChars) {
      pushCur();
      if (parts.length < maxParts) cur = b;
    } else {
      cur = candidate;
    }
  }
  pushCur();
  return parts.slice(0, maxParts);
}

/** Resumen + reglas anti-alucinación — el doc que responde "¿qué marcas tienen?". */
export function renderInventorySummary(vehicles: Vehicle[], baseLabel: string, feedUrl: string): string {
  const makes = new Map<string, number>();
  let min = Infinity;
  let max = -Infinity;
  for (const v of vehicles) {
    if (v.make) makes.set(v.make, (makes.get(v.make) ?? 0) + 1);
    if (v.price !== null) {
      if (v.price < min) min = v.price;
      if (v.price > max) max = v.price;
    }
  }
  const fecha = new Date().toISOString().slice(0, 10);
  const marcaLista = [...makes.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([m, n]) => `${m} (${n})`)
    .join(", ");
  const rango =
    Number.isFinite(min) && Number.isFinite(max)
      ? min === max
        ? `$${min.toLocaleString("en-US")}`
        : `$${min.toLocaleString("en-US")} – $${max.toLocaleString("en-US")}`
      : "—";

  return `Inventario sincronizado desde ${feedUrl} el ${fecha}. Autos en el listado: ${vehicles.length}.
Marcas disponibles: ${marcaLista || "—"}.
Rango de precios: ${rango}.

REGLAS PARA RESPONDER SOBRE AUTOS (${baseLabel}):
- Contestá SOLO con autos, marcas, modelos, precios y millas que aparecen en este inventario o en los documentos "Inventario web" sincronizados. Nunca uses conocimiento general para nombrar marcas o modelos.
- Si el cliente pregunta por una marca, modelo o auto que NO está en el listado, decilo claramente y ofrecé las marcas disponibles de arriba.
- Cuando ofrezcas opciones, da el nombre exacto del auto con su precio y condición, SIN enlaces.
- Si el cliente quiere la ficha de UN auto puntual o da un VIN, usá la tool fichaAuto (link real y foto). Nunca inventes una URL de un auto.`;
}

// ---------------------------------------------------------------------------
// Store en settings (D1)
// ---------------------------------------------------------------------------

export function loadStore(store: VehicleStore | null): VehicleStore {
  if (store && store.vehicles && typeof store.vehicles === "object") return store;
  return { updatedAt: 0, vehicles: {} };
}

export async function loadVehicleStore(db: Db): Promise<VehicleStore> {
  try {
    const raw = await new SettingsRepo(db).get(SETTING_KEYS.webSyncVehicles);
    if (!raw) return { updatedAt: 0, vehicles: {} };
    const parsed = JSON.parse(raw);
    return loadStore(parsed);
  } catch {
    return { updatedAt: 0, vehicles: {} };
  }
}

export async function saveVehicleStore(db: Db, store: VehicleStore): Promise<void> {
  store.updatedAt = Date.now();
  await new SettingsRepo(db).set(SETTING_KEYS.webSyncVehicles, JSON.stringify(store));
}

/** Vehículos del store, en orden estable. */
export function listStoredVehicles(store: VehicleStore): StoredVehicle[] {
  return Object.keys(store.vehicles)
    .sort()
    .map((k) => store.vehicles[k])
    .filter(Boolean);
}

/**
 * Fusiona el inventario recién scrapeado con el store previo: agrega/cambia los
 * autos actuales, marca pendientes de foto los nuevos (o los que cambiaron de
 * ficha/título — un cambio de precio no invalida la foto), y elimina los que ya
 * no están en el feed (vendidos o fuera de la URL configurada).
 */
export function mergeVehicleStore(prev: VehicleStore, current: Vehicle[]): VehicleStore {
  const now = Date.now();
  const vehicles: Record<string, StoredVehicle> = {};
  const seen = new Set<string>();
  for (const v of current) {
    if (seen.has(v.key)) continue;
    seen.add(v.key);
    const old = prev.vehicles[v.key];
    // Preservar datos enriquecidos (precio/millas/condición de una ficha ya
    // scrapeada) cuando la fuente liviana no los trae — el sitemap DealerInspire
    // solo da condición/año/marca/modelo/VIN/link, y sin esto cada sync pisaría
    // el precio/millas con null.
    const price = v.price ?? old?.price ?? null;
    const miles = v.miles ?? old?.miles ?? null;
    const condition = v.condition ?? old?.condition ?? null;
    const changed =
      !old ||
      old.listingUrl !== v.listingUrl ||
      old.title !== v.title ||
      old.price !== price ||
      old.miles !== miles;
    const photoInvalid =
      !old || old.listingUrl !== v.listingUrl || old.title !== v.title;
    vehicles[v.key] = {
      ...v,
      price,
      miles,
      condition,
      imageUrl: photoInvalid ? null : old.imageUrl,
      imgStatus: old && !photoInvalid ? old.imgStatus : "pendiente",
      imgAt: old && !photoInvalid ? old.imgAt : null,
      changedAt: changed ? now : old.changedAt,
    };
  }
  return { updatedAt: prev.updatedAt, vehicles };
}

const IMG_ERROR_COOLDOWN_MS = 3 * 86_400_000; // reintento nocturno cada 3 días si falló
const IMG_ONDEMAND_COOLDOWN_MS = 3_600_000; // bajo demanda: no repetir el intento dentro de 1 h

/**
 * Autos que necesitan scrapear su ficha: les falta foto (imgStatus != ok) o
 * precio (el sitemap de origen no lo trae). Cooldown de 3 días tras un intento
 * para no martillar fichas que no dan datos.
 */
export function imageCandidates(store: VehicleStore): StoredVehicle[] {
  const now = Date.now();
  return listStoredVehicles(store).filter(
    (v) =>
      !!v.listingUrl &&
      (v.imgStatus !== "ok" || v.price === null) &&
      !(v.imgAt !== null && now - v.imgAt < IMG_ERROR_COOLDOWN_MS),
  );
}

export function pendingImageCount(store: VehicleStore): number {
  return imageCandidates(store).length;
}

// ---------------------------------------------------------------------------
// Foto del auto (ficha vía Decodo)
// ---------------------------------------------------------------------------

const IMG_MD_RE = /!\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g;
const OG_RE = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i;
const IMG_TAG_RE = /<img[^>]+src=["']([^"']+)["']/gi;

const IMG_SKIP = ["logo", "icon", "badge", "banner", "map", "sprite", "placeholder"];

function looksLikePhoto(url: string): boolean {
  const u = url.toLowerCase();
  if (u.startsWith("data:")) return false;
  if (/\.(svg|gif)$/.test(u)) return false;
  return !IMG_SKIP.some((s) => u.includes(s));
}

/** Primera imagen de un markdown scrapeado (filtra logos/icons/data-uri). */
export function extractImageFromMarkdown(content: string): string | null {
  let m: RegExpExecArray | null;
  while ((m = IMG_MD_RE.exec(content))) {
    const url = m[1]?.trim();
    if (url && looksLikePhoto(url)) return url;
  }
  return null;
}

/** og:image (o primer <img>) de un HTML scrapeado. */
export function extractImageFromHtml(html: string): string | null {
  const og = OG_RE.exec(html);
  if (og && og[1] && looksLikePhoto(og[1])) return og[1];
  let m: RegExpExecArray | null;
  while ((m = IMG_TAG_RE.exec(html))) {
    const src = m[1]?.trim();
    if (src && looksLikePhoto(src)) return src;
  }
  return null;
}

const PRICE_SELL_RE =
  /(?:sale price|internet price|our price|dealer price|selling price|price|precio)[^\d$]{0,30}\$\s?([\d][\d,]{2,})/i;
const PRICE_MSRP_RE = /(?:msrp|sticker)[^\d$]{0,30}\$\s?([\d][\d,]{2,})/i;
const PRICE_TEXT_RE = /\$\s?([\d][\d,]{2,})/g;
const MILES_TEXT_RE = /([\d][\d,]{1,})\s*(?:miles|mi\.?)\b/i;

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** Precio en USD desde texto libre (markdown de la ficha). Etiqueta primero. */
export function extractPriceFromText(text: string): number | null {
  // Precio de venta primero; MSRP/sticker solo como último recurso etiquetado.
  for (const re of [PRICE_SELL_RE, PRICE_MSRP_RE]) {
    const labeled = re.exec(text);
    if (labeled) {
      const n = toNum(labeled[1]);
      if (n !== null && n >= 500 && n <= 500_000) return n;
    }
  }
  PRICE_TEXT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRICE_TEXT_RE.exec(text))) {
    const n = toNum(m[1]);
    if (n !== null && n >= 1_000 && n <= 500_000) return n;
  }
  return null;
}

/** Millas desde texto libre. */
export function extractMilesFromText(text: string): number | null {
  const m = MILES_TEXT_RE.exec(text);
  return m ? toNum(m[1]) : null;
}

function findVehicleLd(obj: unknown): Record<string, any> | null {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const o of obj) {
      const r = findVehicleLd(o);
      if (r) return r;
    }
    return null;
  }
  const rec = obj as Record<string, any>;
  const t = rec["@type"];
  const types = Array.isArray(t) ? t : [t];
  if (types.some((x) => typeof x === "string" && /vehicle|car|product/i.test(x))) return rec;
  if (rec["@graph"]) return findVehicleLd(rec["@graph"]);
  return null;
}

/**
 * JSON-LD de la ficha (DealerInspire lo trae para SEO): precio, millas e
 * imagen. Fallback a og:image / <img> para la foto. Fail-soft: campos null.
 */
export function extractDetailsFromHtml(html: string): {
  price: number | null;
  miles: number | null;
  image: string | null;
} {
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let price: number | null = null;
  let miles: number | null = null;
  let image: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const v = findVehicleLd(JSON.parse(m[1].trim()));
      if (!v) continue;
      const offers = (Array.isArray(v.offers) ? v.offers[0] : v.offers) as Record<string, any> | undefined;
      price = price ?? toNum(offers?.price) ?? toNum(offers?.lowPrice) ?? toNum(v.price);
      const mo = v.mileageFromOdometer;
      miles = miles ?? toNum(typeof mo === "object" && mo ? mo.value : mo);
      const img = v.image;
      const imgUrl =
        typeof img === "string"
          ? img
          : Array.isArray(img)
            ? typeof img[0] === "string"
              ? img[0]
              : img[0]?.url
            : img?.url;
      if (typeof imgUrl === "string") image = image ?? imgUrl;
    } catch {
      /* JSON-LD inválido — seguimos */
    }
  }
  if (!image) image = extractImageFromHtml(html);
  return { price, miles, image };
}

export interface VehicleDetails {
  imageUrl: string | null;
  price: number | null;
  miles: number | null;
}

/**
 * Scrapea la ficha del auto con Decodo y extrae foto, precio y millas.
 * 1) Markdown (chico): imagen inline + precio/millas por texto.
 * 2) Si falta algo, HTML: JSON-LD (precio/millas/imagen) + og:image.
 * Fail-soft: nunca lanza; los campos que no se encuentren vuelven null.
 */
export async function fetchVehicleDetails(
  env: Env,
  vehicle: Vehicle,
  opts: { timeoutMs?: number } = {},
): Promise<VehicleDetails> {
  const out: VehicleDetails = { imageUrl: null, price: null, miles: null };
  if (!vehicle.listingUrl) return out;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  try {
    // 1) HTML primero: el JSON-LD de la ficha es la fuente AUTORITATIVA de
    // precio/millas (el texto libre del markdown puede traer precios de autos
    // "similares" u otros montos). De paso trae og:image.
    const html = await scrapeUrl(env, vehicle.listingUrl, { markdown: false, timeoutMs });
    if (html.ok) {
      const d = extractDetailsFromHtml(html.content);
      out.price = d.price;
      out.miles = d.miles;
      if (d.image) out.imageUrl = absUrl(vehicle.listingUrl, d.image);
    }
    // 2) Solo si falta la foto, markdown (más liviano) para sacarla inline.
    if (!out.imageUrl) {
      const md = await scrapeUrl(env, vehicle.listingUrl, { markdown: true, timeoutMs });
      if (md.ok) {
        const img = extractImageFromMarkdown(md.content);
        if (img) out.imageUrl = absUrl(vehicle.listingUrl, img);
      }
    }
  } catch {
    /* fail-soft */
  }
  return out;
}

/** Compat: solo la foto (tests). */
export async function fetchVehicleImage(
  env: Env,
  vehicle: Vehicle,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  return (await fetchVehicleDetails(env, vehicle, opts)).imageUrl;
}

/**
 * Corrida nocturna/delta: trae foto + precio + millas de hasta `max` autos
 * pendientes, con un pequeño pool de concurrencia. Guarda el store tras cada
 * auto para no perder progreso si el worker se corta. Fail-soft por auto.
 */
export async function refreshVehicleImages(
  env: Env,
  db: Db,
  opts: { max?: number; timeoutMs?: number; keys?: string[] } = {},
): Promise<{ fetched: number; failed: number; pending: number }> {
  const max = opts.max ?? 20;
  const store = await loadVehicleStore(db);
  const candidates = (
    opts.keys && opts.keys.length
      ? listStoredVehicles(store).filter((v) => opts.keys!.includes(v.key))
      : imageCandidates(store)
  ).slice(0, max);
  let fetched = 0;
  let failed = 0;
  const workers = Math.min(3, candidates.length);
  let i = 0;
  const runOne = async () => {
    while (i < candidates.length) {
      const v = candidates[i++];
      const d = await fetchVehicleDetails(env, v, { timeoutMs: opts.timeoutMs });
      const cur = store.vehicles[v.key];
      if (cur) {
        if (d.price !== null) cur.price = d.price;
        if (d.miles !== null) cur.miles = d.miles;
        if (d.imageUrl) cur.imageUrl = d.imageUrl;
        cur.imgStatus = cur.imageUrl ? "ok" : "error";
        cur.imgAt = Date.now();
        if (d.imageUrl || d.price !== null || d.miles !== null) fetched++;
        else failed++;
        await saveVehicleStore(db, store).catch(() => {});
      } else {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, workers) }, () => runOne()));
  const pending = pendingImageCount(store);
  return { fetched, failed, pending };
}

/**
 * Foto bajo demanda (tool fichaAuto): si el auto no tiene foto guardada, scrapea
 * su ficha en el momento (timeout corto) y cachea el resultado en el store.
 */
/**
 * Detalle bajo demanda (tool fichaAuto): si al auto le falta foto o precio,
 * scrapea su ficha en el momento (timeout corto) y cachea foto + precio +
 * millas en el store. Devuelve el vehículo actualizado (o null si no existe).
 * Fail-soft: si la ficha no responde, devuelve lo que ya había.
 */
export async function ensureVehicleDetails(
  env: Env,
  db: Db,
  key: string,
  opts: { timeoutMs?: number } = {},
): Promise<StoredVehicle | null> {
  const store = await loadVehicleStore(db);
  const v = store.vehicles[key];
  if (!v) return null;
  const needs = !(v.imageUrl && v.imgStatus === "ok") || v.price === null;
  if (!needs) return v;
  // Si ya intentamos scrapear hace <1 h, no hacemos esperar al cliente otra vez
  // (el nightly lo reintenta con su cooldown largo).
  if (v.imgAt !== null && Date.now() - v.imgAt < IMG_ONDEMAND_COOLDOWN_MS) {
    return v;
  }
  const d = await fetchVehicleDetails(env, v, { timeoutMs: opts.timeoutMs ?? 20_000 });
  if (d.price !== null) v.price = d.price;
  if (d.miles !== null) v.miles = d.miles;
  if (d.imageUrl) v.imageUrl = d.imageUrl;
  v.imgStatus = v.imageUrl ? "ok" : "error";
  v.imgAt = Date.now();
  await saveVehicleStore(db, store).catch(() => {});
  return v;
}

/** Compat: solo la foto guardada/recién traída. */
export async function ensureVehicleImage(
  env: Env,
  db: Db,
  key: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  return (await ensureVehicleDetails(env, db, key, opts))?.imageUrl ?? null;
}

// ---------------------------------------------------------------------------
// Consultas para las tools (filtro exacto, sin inventar)
// ---------------------------------------------------------------------------

export interface InventoryFilter {
  marca?: string;
  modelo?: string;
  condicion?: string;
  precioMin?: number;
  precioMax?: number;
  vin?: string;
  /** Término libre: todas las palabras deben aparecer en título/marca/modelo. */
  consulta?: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesFilter(v: Vehicle, f: InventoryFilter): boolean {
  if (f.vin) {
    const vin = norm(f.vin);
    if (!v.vin || !norm(v.vin).includes(vin)) return false;
  }
  if (f.marca && norm(f.marca) !== norm(v.make ?? "")) return false;
  if (f.modelo) {
    const m = norm(f.modelo);
    const hay = norm(`${v.make ?? ""} ${v.model ?? ""} ${v.title}`);
    if (!hay.includes(m)) return false;
  }
  if (f.condicion) {
    const want = norm(f.condicion);
    const have = norm(v.condition ?? "");
    if (want === "usado" || want === "used" || want === "pre-owned" || want === "preowned") {
      if (have !== "usado" && have !== "certificado") return false;
    } else if (want === "nuevo" || want === "new") {
      if (have !== "nuevo") return false;
    } else if (want === "certificado") {
      if (have !== "certificado") return false;
    }
  }
  if (f.precioMin !== undefined && (v.price === null || v.price < f.precioMin)) return false;
  if (f.precioMax !== undefined && (v.price === null || v.price > f.precioMax)) return false;
  if (f.consulta) {
    const tokens = norm(f.consulta).split(/\s+/).filter(Boolean);
    const hay = norm(`${v.title} ${v.make ?? ""} ${v.model ?? ""}`);
    for (const t of tokens) {
      if (!hay.includes(t)) return false;
    }
  }
  return true;
}

export interface InventoryMatch {
  key: string;
  vin: string | null;
  title: string;
  condition: string | null;
  price: number | null;
  miles: number | null;
  listingUrl: string | null;
  hasImage: boolean;
}

export function queryInventory(
  store: VehicleStore,
  f: InventoryFilter,
  limit = 8,
): { matches: InventoryMatch[]; total: number; marcas: { marca: string; total: number }[] } {
  const all = listStoredVehicles(store);
  const filtered = all.filter((v) => matchesFilter(v, f));
  const marcas = new Map<string, number>();
  for (const v of all) {
    if (v.make) marcas.set(v.make, (marcas.get(v.make) ?? 0) + 1);
  }
  return {
    matches: filtered.slice(0, limit).map((v) => ({
      key: v.key,
      vin: v.vin,
      title: v.title,
      condition: v.condition,
      price: v.price,
      miles: v.miles,
      listingUrl: v.listingUrl,
      hasImage: v.imgStatus === "ok" && !!v.imageUrl,
    })),
    total: filtered.length,
    marcas: [...marcas.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([marca, total]) => ({ marca, total })),
  };
}

export function findVehicleByVin(store: VehicleStore, vin: string): StoredVehicle | null {
  const n = norm(vin);
  for (const v of listStoredVehicles(store)) {
    if (v.vin && norm(v.vin).includes(n)) return v;
  }
  return null;
}

/** Encuentra por título EXACTO (o subtítulo inequívoco) — para no inventar. */
export function findVehicleByTitle(store: VehicleStore, title: string): StoredVehicle | null {
  const n = norm(title).trim();
  const all = listStoredVehicles(store);
  const exact = all.filter((v) => norm(v.title) === n);
  if (exact.length === 1) return exact[0];
  const subs = all.filter((v) => norm(v.title).includes(n));
  return subs.length === 1 ? subs[0] : null;
}
