// Sincroniza páginas web a la KB del bot. Pensado para UNA instalación (un
// cliente que quiere que el bot conteste con la info de su sitio). Dos candados
// independientes, ambos fallan cerrados:
//   1. módulo `web_sync` desbloqueado (settings.module_unlocks en D1), Y
//   2. secret DECODO_AUTH presente en el worker.
// Sin cualquiera de los dos, runWebSync no hace nada.
//
// Cada URL configurada → un documento de KB `web:<slug>` (visible y borrable
// desde /admin/kb). Se re-embebe SOLO si el contenido cambió (hash). El bot lo
// encuentra solo vía searchKb — no hay plumbing nuevo en el agente.
//
// MODO INVENTARIO (v1.30): si la página parsea como listado de vehículos, en
// vez del blob de texto (stripMarkdownLinks, regla v1.25) se guarda:
//   - docs de KB compactos por auto (sin links) + un doc `-resumen` con las
//     marcas reales y reglas anti-alucinación,
//   - el inventario estructurado en settings (`web_sync_vehicles`) para las
//     tools inventarioQuery / fichaAuto (link real de ficha + foto).
// Las fotos NO vienen en el feed: se scrapea la ficha de cada auto con Decodo
// (delta nocturno acotado + bajo demanda). Si el contenido no parece
// inventario, el pipeline queda igual que antes (modo texto).

import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { KbDocsRepo, indexDoc, removeDocVectors, MAX_DOC_CHARS } from "./docs";
import { scrapeUrl, decodoConfigured } from "../integrations/decodo";
import {
  parseInventoryFromAny,
  looksLikeInventory,
  renderInventoryParts,
  renderVehicleBlock,
  renderInventorySummary,
  mergeVehicleStore,
  loadVehicleStore,
  saveVehicleStore,
  listStoredVehicles,
  pendingImageCount,
  refreshVehicleImages,
  type Vehicle,
  type VehicleStore,
  type StoredVehicle,
} from "./inventory";

const MAX_URLS = 10;
/** Si una página pasa MAX_DOC_CHARS, se parte en hasta N docs `web:<slug>`, `-2`, `-3`… */
const MAX_PARTS = 8;
/** Fotos por corrida nocturna (delta). El resto se completa en corridas siguientes o bajo demanda. */
export const MAX_IMG_BATCH = 20;

/** Parte el texto en trozos de <= max chars, cortando en salto de línea. */
export function splitParts(text: string, max: number, maxParts: number): string[] {
  const t = text.trim();
  if (t.length <= max) return [t];
  const parts: string[] = [];
  let rest = t;
  while (rest.length > max && parts.length < maxParts - 1) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = max; // sin salto útil → corte duro
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest.slice(0, max).trim());
  return parts;
}

/** id del doc de la parte n (n=1 usa el id base, para compat). */
function partId(baseId: string, n: number): string {
  return n === 1 ? baseId : `${baseId}-${n}`;
}

interface UrlState {
  hash: string;
  at: number;
  chars: number;
  /** Cuántos docs `web:<slug>[-n]` genera esta URL (1 si cabe en un doc). */
  parts?: number;
  /** "inv" = modo inventario (store + doc compacto), "text" = blob legacy. */
  mode?: string;
}

/**
 * Recorta el "chrome" del markdown scrapeado (nav, menús, footer, cookie
 * banners) para que el documento de KB sea contenido útil, no boilerplate.
 * El caso típico (páginas /llm/inventory/ de concesionarios): el primer ~40%
 * es el menú de navegación y el último ~15% es footer + aviso de cookies.
 * Heurística conservadora: si encuentra dónde empieza el contenido real
 * (primer precio, VIN, o listado), corta lo de antes; y corta desde el
 * footer típico. Si no encuentra marcadores, devuelve el texto tal cual.
 */
export function trimBoilerplate(raw: string): string {
  let s = raw.trim();

  // Inicio del contenido real: primer "$1,234" / "VIN:" / "### " tras 500 chars.
  const startRe = /(\$\s?\d[\d,]{3,}|VIN:\s*[A-HJ-NPR-Z0-9]{6,}|^#{2,4}\s+\S)/m;
  const m = startRe.exec(s.slice(400));
  if (m && m.index > 200) s = s.slice(400 + m.index);

  // Footer típico: "## Contact Us" / "## Get Directions" / "## Hours" / cookie.
  const endRe = /\n#{1,3}\s+(Contact Us|Get Directions|Hours|Our Location|Dealer Info|Connect With Us)\b/i;
  const e = endRe.exec(s);
  if (e && e.index > s.length * 0.4) s = s.slice(0, e.index);
  const cookie = s.search(/Your Privacy & Cookies|We respect consumer privacy|Powered by \*\*\[ComplyAuto/i);
  if (cookie > s.length * 0.4) s = s.slice(0, cookie);

  return s.trim();
}

/**
 * Quita los links de markdown del contenido scrapeado — deja el texto del
 * link (`[2020 Kia Sorento](url)` → `2020 Kia Sorento`) pero nunca la URL.
 *
 * Pedido del dueño: el bot NO debe mandar links del inventario/catálogo
 * scrapeado en el chat (se ven como spam o el cliente los copia fuera de
 * WhatsApp) — pero SÍ puede seguir mandando links que vengan de otro lado
 * (KB escrita a mano, `customFields`, el prompt). Por eso esto se aplica
 * SOLO acá, en el pipeline de Web Sync, y no globalmente: es la única fuente
 * de esos links de "Ver listado completo" por auto/producto. (En el modo
 * inventario los links de ficha no van al texto de la KB: viajan por la tool
 * fichaAuto, validados contra el store.)
 */
export function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/** Hash rápido (djb2) del texto — para saltar re-embebidos sin cambios. */
function quickHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Lista de URLs de la config (una por línea o separadas por coma). */
export function parseWebSyncUrls(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
    .slice(0, MAX_URLS);
}

/**
 * id de doc estable por URL. CORTO a propósito: `indexDoc` genera vectores
 * `dash:<id>#<n>` y Vectorize rechaza ids > 64 bytes. Prefijo legible (≤ 30) +
 * hash de la URL completa para unicidad. Ej. `web:greenwaykiawestpalmbeach-1a2b3c`.
 */
export function webDocId(url: string): string {
  let label = "pagina";
  let canon = url;
  try {
    const u = new URL(url);
    // Canonicalizar para que el orden de los query params no cambie el id.
    const q = [...u.searchParams.entries()].sort();
    canon = `${u.hostname}${u.pathname}?${new URLSearchParams(q).toString()}`;
    label =
      (u.hostname.replace(/^www\./, "").split(".")[0] || "sitio")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 30) || "sitio";
  } catch {
    /* url inválida — solo el hash de la cadena cruda */
  }
  return `web:${label}-${quickHash(canon)}`;
}

/** id del doc "resumen + reglas" del modo inventario (una por URL). */
function inventorySummaryDocId(url: string): string {
  return `${webDocId(url)}-resumen`;
}

export interface WebSyncSummary {
  skipped?: string;
  scraped: number;
  updated: number;
  unchanged: number;
  errors: { url: string; error: string }[];
  /** Modo inventario: autos en el store al cierre de la corrida. */
  vehicles?: number;
  imagesFetched?: number;
  imagesFailed?: number;
  /** Fotos pendientes (autos nuevos/cambiados que aún no tienen foto). */
  imagesPending?: number;
}

export interface WebSyncRunOptions {
  /** true en el tick nocturno: además del sync del feed, corre el batch de fotos. */
  images?: boolean;
}

export async function runWebSync(env: Env, opts: WebSyncRunOptions = {}): Promise<WebSyncSummary> {
  const empty: WebSyncSummary = { scraped: 0, updated: 0, unchanged: 0, errors: [] };

  // MODELO (2026-09-07): web_sync disponible en todos los planes — solo pide el
  // secret DECODO_AUTH (cuenta de scraping del dueño).
  if (!(await decodoConfigured(env))) {
    return { ...empty, skipped: "falta la API key de Decodo (Configuración → Scraping web)" };
  }

  const db = new Db(env.DB);
  const repo = new SettingsRepo(db);
  const settings = await repo.all();
  const urls = parseWebSyncUrls(settings[SETTING_KEYS.webSyncUrls]);
  if (urls.length === 0) return { ...empty, skipped: "sin URLs configuradas" };

  let state: Record<string, UrlState> = {};
  try {
    const parsed = JSON.parse(settings[SETTING_KEYS.webSyncState] ?? "{}");
    if (parsed && typeof parsed === "object") state = parsed;
  } catch {
    /* estado corrupto — se reconstruye */
  }

  const kb = new KbDocsRepo(db);
  const summary: WebSyncSummary = { scraped: 0, updated: 0, unchanged: 0, errors: [] };

  // Agregador del modo inventario (una instalación → típicamente UNA URL).
  let inventorySeen = false;
  const allVehicles: Vehicle[] = [];
  // Store ANTES del sync: el sitemap no trae precio/millas, así que al renderizar
  // la KB se superponen los datos ya enriquecidos de cada ficha (si los hay).
  const storeBefore: VehicleStore = await loadVehicleStore(db).catch(() => ({ updatedAt: 0, vehicles: {} }));

  for (const url of urls) {
    const r = await scrapeUrl(env, url);
    if (!r.ok) {
      console.warn(`[webSync] ${url}: ${r.error}`);
      summary.errors.push({ url, error: r.error });
      continue;
    }
    summary.scraped++;

    const trimmed = trimBoilerplate(r.content);
    const parsed = parseInventoryFromAny(trimmed, url);
    // Modo inventario: entra si parsea bien, o si la URL YA estaba en modo
    // inventario y el feed sigue trayendo autos (aunque sean pocos).
    const prevMode = state[url]?.mode;
    const isInv = looksLikeInventory(parsed)
      ? true
      : prevMode === "inv" && parsed.length >= 1
        ? true
        : false;

    // Overlay de datos reales ya enriquecidos (precio/millas/condición) para que
    // la KB muestre TODO lo que se extrajo de la ficha, no solo lo del sitemap.
    const renderList: Vehicle[] = isInv
      ? parsed.map((v) => {
          const s = storeBefore.vehicles[v.key];
          if (!s) return v;
          return {
            ...v,
            price: v.price ?? s.price,
            miles: v.miles ?? s.miles,
            condition: v.condition ?? s.condition,
          };
        })
      : parsed;

    const full = isInv
      ? renderList.map(renderVehicleBlock).join("\n\n")
      : stripMarkdownLinks(trimmed);
    const parts = isInv
      ? renderInventoryParts(renderList, MAX_DOC_CHARS, MAX_PARTS)
      : splitParts(full, MAX_DOC_CHARS, MAX_PARTS);
    const hash = quickHash(full);
    const baseId = webDocId(url);
    const prevParts = state[url]?.parts ?? 1;

    if (isInv) {
      inventorySeen = true;
      allVehicles.push(...parsed);
    }

    if (state[url]?.hash === hash && prevParts === parts.length) {
      summary.unchanged++;
      continue;
    }

    const base = `${new URL(url).pathname}${new URL(url).search}`;
    try {
      for (let i = 0; i < parts.length; i++) {
        const id = partId(baseId, i + 1);
        const title =
          parts.length > 1
            ? `Inventario web — ${base} (parte ${i + 1}/${parts.length})`
            : `Inventario web — ${base}`;
        await kb.upsert({ id, title, content: parts[i] });
        const doc = await kb.getById(id);
        if (doc) await indexDoc(env, doc);
      }
      // Si antes había más partes, borrar las sobrantes.
      for (let i = parts.length + 1; i <= prevParts; i++) {
        const id = partId(baseId, i);
        await removeDocVectors(env, id).catch(() => {});
        await kb.delete(id).catch(() => {});
      }

      // Doc "resumen + reglas" del modo inventario (1 por URL, chico).
      const summaryDocId = inventorySummaryDocId(url);
      if (isInv) {
        const sumContent = renderInventorySummary(renderList, base, url);
        await kb.upsert({ id: summaryDocId, title: `Inventario web — ${base} — resumen`, content: sumContent });
        const sumDoc = await kb.getById(summaryDocId);
        if (sumDoc) await indexDoc(env, sumDoc);
      } else {
        // Salió del modo inventario → el resumen ya no aplica.
        await removeDocVectors(env, summaryDocId).catch(() => {});
        await kb.delete(summaryDocId).catch(() => {});
      }

      state[url] = {
        hash,
        at: Date.now(),
        chars: full.length,
        parts: parts.length,
        mode: isInv ? "inv" : "text",
      };
      summary.updated++;
      console.log(`[webSync] ${url} → ${parts.length} doc(s) ${isInv ? "(inventario)" : "(texto)"}, ${full.length} chars`);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      console.error(`[webSync] ${url}: fallo al guardar/indexar: ${msg}`);
      summary.errors.push({ url, error: msg });
    }
  }

  // Limpiar docs de URLs que ya no están en la config (partes + resumen).
  for (const oldUrl of Object.keys(state)) {
    if (!urls.includes(oldUrl)) {
      const baseId = webDocId(oldUrl);
      const n = state[oldUrl]?.parts ?? 1;
      for (let i = 1; i <= n; i++) {
        const id = partId(baseId, i);
        await removeDocVectors(env, id).catch(() => {});
        await kb.delete(id).catch(() => {});
      }
      const sumId = inventorySummaryDocId(oldUrl);
      await removeDocVectors(env, sumId).catch(() => {});
      await kb.delete(sumId).catch(() => {});
      delete state[oldUrl];
      console.log(`[webSync] ${oldUrl} salió de la config → docs eliminados`);
    }
  }

  // ── Modo inventario: mantener el store estructurado (tools) ──────────────
  // Solo se toca si esta corrida vio inventario: si el feed falló entero o la
  // página dejó de parsear, se conserva el último store conocido (no se borra).
  if (inventorySeen) {
    try {
      const prev = await loadVehicleStore(db);
      const merged = mergeVehicleStore(prev, allVehicles);
      await saveVehicleStore(db, merged);
      summary.vehicles = listStoredVehicles(merged).length;
      summary.imagesPending = pendingImageCount(merged);

      if (opts.images) {
        const img = await refreshVehicleImages(env, db);
        summary.imagesFetched = img.fetched;
        summary.imagesFailed = img.failed;
        summary.imagesPending = img.pending;
      }
    } catch (e) {
      console.error(`[webSync] inventario: fallo al guardar el store: ${String((e as Error)?.message ?? e)}`);
    }
  } else if (summary.errors.length === 0) {
    // No se vio inventario y NO hubo errores de scrape: se quitan SOLO los autos
    // cuyo feed ya no está configurado (p. ej. la URL salió de la config). NUNCA
    // vaciar el store por un fallo transitorio de Decodo (bug real: un scrape
    // vacío borró los 449 autos).
    const store = await loadVehicleStore(db).catch(() => ({ updatedAt: 0, vehicles: {} }));
    const all = listStoredVehicles(store);
    const keep = all.filter((v) => urls.includes(v.feedUrl));
    if (keep.length !== all.length) {
      const vehicles: Record<string, (typeof all)[number]> = {};
      for (const v of keep) vehicles[v.key] = v;
      await saveVehicleStore(db, { updatedAt: Date.now(), vehicles }).catch(() => {});
    }
  }

  await repo.set(SETTING_KEYS.webSyncState, JSON.stringify(state));
  await repo.set(SETTING_KEYS.webSyncLastRun, String(Date.now()));
  return summary;
}

/**
 * Reconstruye los docs de KB del inventario a partir del STORE ya poblado,
 * SIN scrapear el feed. Sirve cuando el sitemap está bloqueado/caído pero ya
 * tenemos los autos (y sus precios/fotos enriquecidos) en settings. Idempotente:
 * re-embebe cada parte y borra las sobrantes; actualiza el state para no
 * re-embebar de más en el próximo sync.
 */
export async function rebuildInventoryKb(
  env: Env,
  db: Db,
): Promise<{ vehicles: number; updated: number; errors: number }> {
  const store = await loadVehicleStore(db);
  const all = listStoredVehicles(store);
  if (all.length === 0) return { vehicles: 0, updated: 0, errors: 0 };

  const kb = new KbDocsRepo(db);
  const repo = new SettingsRepo(db);
  let state: Record<string, UrlState> = {};
  try {
    state = JSON.parse((await repo.get(SETTING_KEYS.webSyncState)) ?? "{}");
  } catch {
    state = {};
  }

  const byFeed = new Map<string, StoredVehicle[]>();
  for (const v of all) {
    const f = v.feedUrl || "";
    if (!f) continue;
    const list = byFeed.get(f) ?? [];
    list.push(v);
    byFeed.set(f, list);
  }

  let updated = 0;
  let errors = 0;
  for (const [feedUrl, vehicles] of byFeed) {
    const baseId = webDocId(feedUrl);
    const base = baseId.startsWith("web:") ? baseId.slice(4) : baseId;
    const parts = renderInventoryParts(vehicles, MAX_DOC_CHARS, MAX_PARTS);
    const full = vehicles.map(renderVehicleBlock).join("\n\n");
    const hash = quickHash(full);
    const prevParts = state[feedUrl]?.parts ?? 1;
    try {
      for (let i = 0; i < parts.length; i++) {
        const id = i === 0 ? baseId : partId(baseId, i + 1);
        await kb.upsert({
          id,
          title: `Inventario web — ${base}${i ? ` (${i + 1})` : ""}`,
          content: parts[i],
        });
        const doc = await kb.getById(id);
        if (doc) await indexDoc(env, doc);
      }
      // Partes que ya no existen (el listado se achicó).
      for (let i = parts.length + 1; i <= prevParts; i++) {
        const id = partId(baseId, i);
        await removeDocVectors(env, id).catch(() => {});
        await kb.delete(id).catch(() => {});
      }
      const sumId = inventorySummaryDocId(feedUrl);
      await kb.upsert({
        id: sumId,
        title: `Inventario web — ${base} — resumen`,
        content: renderInventorySummary(vehicles, base, feedUrl),
      });
      const sumDoc = await kb.getById(sumId);
      if (sumDoc) await indexDoc(env, sumDoc);
      state[feedUrl] = { hash, at: Date.now(), chars: full.length, parts: parts.length, mode: "inv" };
      updated++;
    } catch (e) {
      console.error(`[rebuildInventoryKb] ${feedUrl}:`, e);
      errors++;
    }
  }

  await repo.set(SETTING_KEYS.webSyncState, JSON.stringify(state));
  return { vehicles: all.length, updated, errors };
}
