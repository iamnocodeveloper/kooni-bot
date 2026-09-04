import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { KbDocsRepo, indexDoc, removeDocVectors, MAX_DOC_CHARS } from "./docs";
import { isModuleUnlocked } from "../modules";
import { scrapeUrl, decodoConfigured } from "../integrations/decodo";

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

const MAX_URLS = 10;
/** Si una página pasa MAX_DOC_CHARS, se parte en hasta N docs `web:<slug>`, `-2`, `-3`… */
const MAX_PARTS = 8;

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
 * de esos links de "Ver listado completo" por auto/producto.
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

export interface WebSyncSummary {
  skipped?: string;
  scraped: number;
  updated: number;
  unchanged: number;
  errors: { url: string; error: string }[];
}

export async function runWebSync(env: Env): Promise<WebSyncSummary> {
  const empty: WebSyncSummary = { scraped: 0, updated: 0, unchanged: 0, errors: [] };

  if (!(await isModuleUnlocked(env, "web_sync"))) {
    return { ...empty, skipped: "módulo web_sync no desbloqueado" };
  }
  if (!decodoConfigured(env)) {
    return { ...empty, skipped: "falta el secret DECODO_AUTH" };
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

  for (const url of urls) {
    const r = await scrapeUrl(env, url);
    if (!r.ok) {
      console.warn(`[webSync] ${url}: ${r.error}`);
      summary.errors.push({ url, error: r.error });
      continue;
    }
    summary.scraped++;
    const full = stripMarkdownLinks(trimBoilerplate(r.content));
    const parts = splitParts(full, MAX_DOC_CHARS, MAX_PARTS);
    const hash = quickHash(full);
    const baseId = webDocId(url);
    const prevParts = state[url]?.parts ?? 1;

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
      state[url] = { hash, at: Date.now(), chars: full.length, parts: parts.length };
      summary.updated++;
      console.log(`[webSync] ${url} → ${parts.length} doc(s), ${full.length} chars`);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      console.error(`[webSync] ${url}: fallo al guardar/indexar: ${msg}`);
      summary.errors.push({ url, error: msg });
    }
  }

  // Limpiar docs de URLs que ya no están en la config (todas sus partes).
  for (const oldUrl of Object.keys(state)) {
    if (!urls.includes(oldUrl)) {
      const baseId = webDocId(oldUrl);
      const n = state[oldUrl]?.parts ?? 1;
      for (let i = 1; i <= n; i++) {
        const id = partId(baseId, i);
        await removeDocVectors(env, id).catch(() => {});
        await kb.delete(id).catch(() => {});
      }
      delete state[oldUrl];
      console.log(`[webSync] ${oldUrl} salió de la config → ${n} doc(s) eliminados`);
    }
  }

  await repo.set(SETTING_KEYS.webSyncState, JSON.stringify(state));
  await repo.set(SETTING_KEYS.webSyncLastRun, String(Date.now()));
  return summary;
}
