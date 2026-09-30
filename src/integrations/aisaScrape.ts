import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";

// Cliente de **AIsa** (gateway api.aisa.one) para el módulo Firecrawl.
//
//   POST /apis/v1/firecrawl/scrape  { url, proxy:"basic", formats:["markdown"] }
//   POST /apis/v1/firecrawl/map     { url, limit }            → { success, links:[{url,title,…}] }
//   POST /apis/v1/firecrawl/search  { query, limit }
//
// Sirve para sitios que **bloquean** al Worker (403 del WAF): el gateway los lee
// por nosotros. Es la alternativa a Decodo, con la misma key del LLM cuando esa
// key ES de AIsa (así no hay que configurar nada nuevo).
//
// La respuesta de `map` trae `links` en la RAÍZ (no en `data`); la de `scrape`
// trae `data.markdown` + `data.metadata`. `creditsUsed` puede venir vacío.

const AISA_BASE = "https://api.aisa.one";
const TIMEOUT_MS = 120_000; // Firecrawl tarda ~10 s por página

export type AisaErrorCode = "config" | "auth" | "quota" | "rate_limit" | "server" | "empty" | "timeout" | "unknown";

export interface AisaScrapeResult {
  ok: boolean;
  markdown?: string;
  title?: string;
  statusCode?: number;
  error?: string;
  code?: AisaErrorCode;
}

export interface AisaMapResult {
  ok: boolean;
  links: string[];
  error?: string;
  code?: AisaErrorCode;
}

/** Key de AIsa: setting propio → env → la del LLM (que suele ser la misma). */
export async function resolveAisaKey(env: Env): Promise<string | null> {
  try {
    const repo = new SettingsRepo(new Db(env.DB));
    const own = (await repo.get(SETTING_KEYS.aisaApiKey))?.trim();
    if (own) return own;
    const llm = (await repo.get(SETTING_KEYS.llmApiKey))?.trim();
    if (llm) return llm;
  } catch {
    /* sin DB → env */
  }
  return (env.AISA_API_KEY ?? "").trim() || (env.OPENAI_API_KEY ?? "").trim() || null;
}

export async function aisaConfigured(env: Env): Promise<boolean> {
  return (await resolveAisaKey(env)) !== null;
}

function classify(status: number, body: string): { code: AisaErrorCode; error: string } {
  if (status === 401 || status === 403) {
    return { code: "auth", error: "AIsa rechazó la credencial (revisá la API key en Configuración → Scraping)." };
  }
  if (status === 402 || status === 429) {
    const quota = /quota|credit|balance|insufficient|payment|limit reached/i.test(body);
    return quota
      ? { code: "quota", error: "AIsa: sin créditos/saldo (revisá tu cuenta de AIsa)." }
      : { code: "rate_limit", error: `AIsa: rate limit (HTTP ${status}).` };
  }
  if (status >= 500) return { code: "server", error: `AIsa devolvió ${status}.` };
  return { code: "unknown", error: `AIsa HTTP ${status}: ${body.slice(0, 200)}` };
}

async function post(env: Env, path: string, payload: unknown): Promise<{ ok: boolean; status: number; json?: any; error?: string; code?: AisaErrorCode }> {
  const key = await resolveAisaKey(env);
  if (!key) return { ok: false, status: 0, error: "AIsa no configurado", code: "config" };
  try {
    const res = await fetch(`${AISA_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, ...classify(res.status, body) };
    }
    return { ok: true, status: res.status, json: await res.json().catch(() => ({})) };
  } catch (e) {
    return { ok: false, status: 0, error: String((e as Error)?.message ?? e), code: "timeout" };
  }
}

/** Scrapea una URL y devuelve el markdown (con precio/fotos de la ficha). */
export async function aisaScrape(env: Env, url: string): Promise<AisaScrapeResult> {
  const r = await post(env, "/apis/v1/firecrawl/scrape", { url, proxy: "basic", formats: ["markdown"] });
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  const data = r.json?.data ?? {};
  const md = typeof data.markdown === "string" ? data.markdown : "";
  if (!md.trim()) return { ok: false, code: "empty", error: "AIsa: sin contenido" };
  return { ok: true, markdown: md, title: data.metadata?.title, statusCode: data.metadata?.statusCode };
}

/**
 * Descubre links del sitio con Firecrawl `map`. Devuelve URLs absolutas.
 * `limit` alto: el sitio del dealer tiene ~490 links (341 de inventario).
 */
export async function aisaMap(env: Env, url: string, limit = 1000): Promise<AisaMapResult> {
  const r = await post(env, "/apis/v1/firecrawl/map", { url, limit });
  if (!r.ok) return { ok: false, links: [], error: r.error, code: r.code };
  // `links` viene en la raíz y puede ser strings u objetos {url,...}.
  const raw = r.json?.links ?? r.json?.data?.links ?? [];
  const links = (Array.isArray(raw) ? raw : [])
    .map((l: any) => (typeof l === "string" ? l : l?.url))
    .filter((u: any): u is string => typeof u === "string" && u.length > 0);
  return { ok: true, links };
}
