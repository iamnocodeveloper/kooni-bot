// Inventario de PROPIEDADES del giro inmobiliaria. Es el gemelo de
// `src/kb/inventory.ts` (los autos): mismo patrón —un JSON en `settings`, sin
// tabla nueva— pero con los campos de una propiedad. Lo alimentan:
//   - el importador CSV del panel (`propertiesCsv.ts`), y
//   - la lectura del sitio de la inmobiliaria (`propertiesScrape.ts`).
// Lo consumen las tools `buscarPropiedad` (filtros exactos, anti-invento) y
// `fichaPropiedad` (detalle + foto).
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { paginate } from "./inventory";

export type Operacion = "venta" | "renta";
export type EstatusPropiedad = "disponible" | "apartado" | "vendido" | "rentado";
export type Moneda = "MXN" | "USD";
export type PropiedadSource = "csv" | "web";

export interface Propiedad {
  key: string;
  /** Referencia/clave interna del anuncio (ej. "LN-1024"). */
  codigo: string | null;
  title: string;
  operacion: Operacion | null;
  tipo: string | null;
  zona: string | null;
  precio: number | null;
  moneda: Moneda | null;
  recamaras: number | null;
  banos: number | null;
  estacionamiento: number | null;
  m2: number | null;
  m2Terreno: number | null;
  estatus: EstatusPropiedad | null;
  extras: string | null;
  requisitos: string | null;
  listingUrl: string | null;
  feedUrl: string | null;
  source: PropiedadSource;
}

export interface StoredPropiedad extends Propiedad {
  imageUrl: string | null;
  imgStatus: "ok" | "pendiente" | "error";
  imgAt: number | null;
  updatedAt: number;
}

/**
 * Propiedad que llega desde un importador (CSV del panel): puede traer la foto
 * ya resuelta en la columna `imagen`.
 */
export interface PropiedadImport extends Propiedad {
  imageUrl?: string | null;
}

export interface PropiedadStore {
  updatedAt: number;
  props: Record<string, StoredPropiedad>;
}

export interface PropiedadFilter {
  operacion?: string;
  tipo?: string;
  zona?: string;
  precioMin?: number;
  precioMax?: number;
  moneda?: string;
  recamarasMin?: number;
  consulta?: string;
}

export interface PropiedadMatch {
  key: string;
  codigo: string | null;
  titulo: string;
  operacion: Operacion | null;
  tipo: string | null;
  zona: string | null;
  precio: number | null;
  moneda: Moneda | null;
  recamaras: number | null;
  banos: number | null;
  m2: number | null;
  estatus: EstatusPropiedad | null;
  url: string | null;
  hasImage: boolean;
}

export interface PropiedadSummary {
  total: number;
  venta: number;
  renta: number;
  conPrecio: number;
  sinPrecio: number;
  recamaras: string | null;
  precioVenta: string | null;
  precioRenta: string | null;
}

/** Normaliza texto para comparar: sin acentos, minúsculas, espacios simples. */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Llave estable: código si lo hay, si no la URL de la ficha. */
export function propertyKey(codigo: string | null, listingUrl: string | null): string {
  if (codigo && codigo.trim()) return `cod:${norm(codigo)}`;
  if (listingUrl && listingUrl.trim()) return `url:${norm(listingUrl)}`;
  return `t:${Math.random().toString(36).slice(2, 10)}`;
}

export function loadPropiedadStore(store: PropiedadStore | null): PropiedadStore {
  if (!store || typeof store !== "object") return { updatedAt: 0, props: {} };
  return {
    updatedAt: Number(store.updatedAt) || 0,
    props: store.props && typeof store.props === "object" ? store.props : {},
  };
}

export async function loadPropiedadStoreFromDb(db: Db): Promise<PropiedadStore> {
  try {
    const raw = await new SettingsRepo(db).get(SETTING_KEYS.webSyncProperties);
    if (!raw) return { updatedAt: 0, props: {} };
    return loadPropiedadStore(JSON.parse(raw) as PropiedadStore);
  } catch {
    return { updatedAt: 0, props: {} };
  }
}

/** Guarda el store. Avisa (sin romper) si el JSON se acerca al límite de fila de D1. */
export async function savePropiedadStore(db: Db, store: PropiedadStore): Promise<number> {
  store.updatedAt = Date.now();
  const json = JSON.stringify(store);
  if (json.length > 800_000) {
    console.warn(
      `[propiedades] el store pesa ${json.length} bytes: cerca del límite de una fila de D1. ` +
        `Conviene depurar propiedades vendidas/rentadas.`,
    );
  }
  await new SettingsRepo(db).set(SETTING_KEYS.webSyncProperties, json);
  return json.length;
}

/** Propiedades del store, en orden estable por llave. */
export function listStoredPropiedades(store: PropiedadStore): StoredPropiedad[] {
  return Object.keys(store.props)
    .sort()
    .map((k) => store.props[k])
    .filter((p): p is StoredPropiedad => Boolean(p));
}

export function lacksPhoto(p: StoredPropiedad): boolean {
  return !p.imageUrl;
}

/** Filtros del panel (no los del bot). */
export type PropiedadStoreFilter = "all" | "venta" | "renta" | "sinprecio" | "sinfoto";

export function filterStoredPropiedades(
  props: StoredPropiedad[],
  opts: { q?: string; f?: PropiedadStoreFilter } = {},
): StoredPropiedad[] {
  const q = norm(opts.q ?? "");
  const f = opts.f ?? "all";
  return props.filter((p) => {
    if (f === "venta" && p.operacion !== "venta") return false;
    if (f === "renta" && p.operacion !== "renta") return false;
    if (f === "sinprecio" && p.precio !== null) return false;
    if (f === "sinfoto" && !lacksPhoto(p)) return false;
    if (q) {
      const hay = norm(
        `${p.title} ${p.codigo ?? ""} ${p.zona ?? ""} ${p.tipo ?? ""} ${p.operacion ?? ""} ${p.listingUrl ?? ""}`,
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Mezcla propiedades entrantes al store sin pisar lo ya enriquecido.
 * La foto y los datos que sólo trae la lectura del sitio se conservan si la
 * entrada nueva no los trae (el CSV suele venir incompleto).
 */
export function mergePropiedades(
  store: PropiedadStore,
  incoming: PropiedadImport[],
  opts: { now?: number } = {},
): { store: PropiedadStore; added: number; updated: number; unchanged: number } {
  const now = opts.now ?? Date.now();
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const p of incoming) {
    const key = p.key;
    const prev = store.props[key];
    const img = p.imageUrl ?? null;
    if (!prev) {
      store.props[key] = {
        ...p,
        imageUrl: img,
        imgStatus: img ? "ok" : "pendiente",
        imgAt: img ? now : null,
        updatedAt: now,
      };
      added++;
      continue;
    }
    const next: StoredPropiedad = {
      ...prev,
      ...p,
      // Precio/estatus: si el nuevo parseo no los trajo, se conserva lo anterior.
      precio: p.precio ?? prev.precio,
      estatus: p.estatus ?? prev.estatus,
      zona: p.zona ?? prev.zona,
      recamaras: p.recamaras ?? prev.recamaras,
      banos: p.banos ?? prev.banos,
      m2: p.m2 ?? prev.m2,
      imageUrl: img ?? prev.imageUrl,
      imgStatus: img ? "ok" : prev.imgStatus,
      imgAt: img ? now : prev.imgAt,
      updatedAt: now,
    };
    const changed = JSON.stringify({ ...prev, updatedAt: 0 }) !== JSON.stringify({ ...next, updatedAt: 0 });
    store.props[key] = next;
    if (changed) updated++;
    else unchanged++;
  }
  store.updatedAt = now;
  return { store, added, updated, unchanged };
}

/** ¿La propiedad pasa el filtro estructurado del bot? */
function matchesFilter(p: StoredPropiedad, f: PropiedadFilter): boolean {
  if (f.operacion) {
    const want = norm(f.operacion);
    const op = norm(p.operacion ?? "");
    if (want.startsWith("vent") && op !== "venta") return false;
    if ((want.startsWith("rent") || want.startsWith("alquil")) && op !== "renta") return false;
  }
  if (f.moneda && norm(f.moneda) !== norm(p.moneda ?? "")) return false;
  if (f.tipo) {
    const want = norm(f.tipo);
    const hay = norm(`${p.tipo ?? ""} ${p.title}`);
    if (!hay.includes(want)) return false;
  }
  if (f.zona) {
    const want = norm(f.zona);
    const hay = norm(`${p.zona ?? ""} ${p.title} ${p.listingUrl ?? ""}`);
    if (!hay.includes(want)) return false;
  }
  if (f.recamarasMin !== undefined && (p.recamaras === null || p.recamaras < f.recamarasMin)) return false;
  // Igual que los autos: una propiedad SIN precio no cumple ninguna cota.
  if (f.precioMin !== undefined && (p.precio === null || p.precio < f.precioMin)) return false;
  if (f.precioMax !== undefined && (p.precio === null || p.precio > f.precioMax)) return false;
  if (f.consulta) {
    const hay = norm(`${p.title} ${p.zona ?? ""} ${p.tipo ?? ""} ${p.codigo ?? ""} ${p.extras ?? ""}`);
    for (const tok of norm(f.consulta).split(" ").filter(Boolean)) {
      if (!hay.includes(tok)) return false;
    }
  }
  return true;
}

function fmtMoney(n: number | null, moneda: Moneda | null): string | null {
  if (n === null) return null;
  return `${moneda === "USD" ? "US$" : "$"}${n.toLocaleString("es-MX")}`;
}

/**
 * Consulta del bot: filtra, resume y pagina. Devuelve `hasMore` para que el
 * modelo pueda ofrecer "¿querés ver más?" sin inventar propiedades.
 */
export function queryPropiedades(
  store: PropiedadStore,
  f: PropiedadFilter,
  limit = 12,
  offset = 0,
): {
  matches: PropiedadMatch[];
  total: number;
  zonas: { zona: string; total: number }[];
  resumen: PropiedadSummary;
  offset: number;
  hasMore: boolean;
} {
  const all = listStoredPropiedades(store).filter((p) => matchesFilter(p, f));
  const page = all.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit));

  const zonaCount = new Map<string, number>();
  for (const p of all) {
    if (!p.zona) continue;
    zonaCount.set(p.zona, (zonaCount.get(p.zona) ?? 0) + 1);
  }
  const zonas = [...zonaCount.entries()]
    .map(([zona, total]) => ({ zona, total }))
    .sort((a, b) => b.total - a.total || a.zona.localeCompare(b.zona))
    .slice(0, 12);

  const ventas = all.map((p) => (p.operacion === "venta" ? p.precio : null)).filter((n): n is number => n !== null);
  const rentas = all.map((p) => (p.operacion === "renta" ? p.precio : null)).filter((n): n is number => n !== null);
  const recs = all.map((p) => p.recamaras).filter((n): n is number => n !== null);

  return {
    matches: page.map((p) => ({
      key: p.key,
      codigo: p.codigo,
      titulo: p.title,
      operacion: p.operacion,
      tipo: p.tipo,
      zona: p.zona,
      precio: p.precio,
      moneda: p.moneda,
      recamaras: p.recamaras,
      banos: p.banos,
      m2: p.m2,
      estatus: p.estatus,
      url: p.listingUrl,
      hasImage: Boolean(p.imageUrl),
    })),
    total: all.length,
    zonas,
    resumen: {
      total: all.length,
      venta: all.filter((p) => p.operacion === "venta").length,
      renta: all.filter((p) => p.operacion === "renta").length,
      conPrecio: all.filter((p) => p.precio !== null).length,
      sinPrecio: all.filter((p) => p.precio === null).length,
      recamaras: recs.length ? `${Math.min(...recs)}-${Math.max(...recs)}` : null,
      precioVenta: ventas.length ? `${fmtMoney(Math.min(...ventas), "MXN")} - ${fmtMoney(Math.max(...ventas), "MXN")}` : null,
      precioRenta: rentas.length ? `${fmtMoney(Math.min(...rentas), "MXN")} - ${fmtMoney(Math.max(...rentas), "MXN")}` : null,
    },
    offset,
    hasMore: offset + page.length < all.length,
  };
}

/** Busca por código/referencia exacta (normalizado). */
export function findPropiedadByCodigo(store: PropiedadStore, codigo: string): StoredPropiedad | null {
  const want = norm(codigo);
  for (const p of listStoredPropiedades(store)) {
    if (p.codigo && norm(p.codigo) === want) return p;
  }
  return null;
}

/** Busca por título: exacto primero, después coincidencia única por substring. */
export function findPropiedadByTitle(store: PropiedadStore, title: string): StoredPropiedad | { ambiguo: true; candidatos: string[] } | null {
  const want = norm(title);
  const all = listStoredPropiedades(store);
  const exact = all.find((p) => norm(p.title) === want);
  if (exact) return exact;
  const hits = all.filter((p) => norm(p.title).includes(want) || norm(`${p.zona ?? ""} ${p.title}`).includes(want));
  if (hits.length === 1) return hits[0] ?? null;
  if (hits.length > 1) return { ambiguo: true, candidatos: hits.slice(0, 8).map((p) => p.title) };
  return null;
}

/**
 * Doc de resumen que se indexa en la KB (`propiedades-resumen`): le da al bot el
 * panorama (cuántas, dónde, en qué rango) aunque no llame a `buscarPropiedad`.
 * Se arma con párrafos separados por línea en blanco (así lo chunkea `indexDoc`).
 */
export function buildPropiedadesResumen(store: PropiedadStore): string {
  const all = listStoredPropiedades(store);
  if (all.length === 0) return "";
  const q = queryPropiedades(store, {}, all.length, 0);
  const r = q.resumen;
  const porZona = q.zonas.map((z) => `${z.zona} (${z.total})`).join(", ");
  const porTipo = new Map<string, number>();
  for (const p of all) {
    const t = p.tipo ?? "sin tipo";
    porTipo.set(t, (porTipo.get(t) ?? 0) + 1);
  }
  const tipos = [...porTipo.entries()].map(([t, n]) => `${t} (${n})`).join(", ");

  return [
    `# Inventario de propiedades (${all.length})`,
    `Total en cartera: ${all.length} propiedades — ${r.venta} en venta y ${r.renta} en renta.`,
    porZona ? `Zonas disponibles: ${porZona}.` : "",
    tipos ? `Tipos: ${tipos}.` : "",
    r.precioVenta ? `Rango de precios de venta: ${r.precioVenta}.` : "",
    r.precioRenta ? `Rango de rentas: ${r.precioRenta} por mes.` : "",
    r.recamaras ? `Recámaras disponibles: de ${r.recamaras}.` : "",
    r.sinPrecio > 0 ? "Hay propiedades con precio a consultar: no inventes el precio, se confirma con un asesor." : "",
    "Para mostrar opciones concretas usá la herramienta buscarPropiedad con los filtros del cliente (operación, zona, presupuesto, recámaras). Para el detalle de una propiedad usá fichaPropiedad.",
  ]
    .filter(Boolean)
    .map((s) => s.trim())
    .join("\n\n");
}

export { paginate };
