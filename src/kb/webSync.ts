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

interface UrlState {
  hash: string;
  at: number;
  chars: number;
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
    const content = r.content.trim().slice(0, MAX_DOC_CHARS);
    const hash = quickHash(content);
    const id = webDocId(url);

    if (state[url]?.hash === hash) {
      summary.unchanged++;
      continue;
    }

    const title = `Inventario web — ${new URL(url).pathname}${new URL(url).search}`;
    try {
      await kb.upsert({ id, title, content });
      const doc = await kb.getById(id);
      if (doc) await indexDoc(env, doc);
      state[url] = { hash, at: Date.now(), chars: content.length };
      summary.updated++;
      console.log(`[webSync] ${url} → ${id} (${content.length} chars) reindexado`);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      console.error(`[webSync] ${url}: fallo al guardar/indexar: ${msg}`);
      summary.errors.push({ url, error: msg });
    }
  }

  // Limpiar docs de URLs que ya no están en la config.
  for (const oldUrl of Object.keys(state)) {
    if (!urls.includes(oldUrl)) {
      const id = webDocId(oldUrl);
      await removeDocVectors(env, id).catch(() => {});
      await kb.delete(id).catch(() => {});
      delete state[oldUrl];
      console.log(`[webSync] ${oldUrl} salió de la config → doc ${id} eliminado`);
    }
  }

  await repo.set(SETTING_KEYS.webSyncState, JSON.stringify(state));
  await repo.set(SETTING_KEYS.webSyncLastRun, String(Date.now()));
  return summary;
}
