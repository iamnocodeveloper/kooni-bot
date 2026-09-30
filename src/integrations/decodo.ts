import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";

// Cliente de Decodo Scraper API v2 (scraper-api.decodo.com/v2/scrape).
// Se usa SOLO desde src/kb/webSync.ts / src/kb/inventory.ts, y solo si existe
// credencial (settings del panel o el secret DECODO_AUTH).
//
// Contrato:
//   POST /v2/scrape
//   Authorization: Basic <base64(user:pass)>
//   { url, proxy_pool, headless, markdown }
//   → 200 { results: [{ content, status_code, url, ... }] }
//
// Endurecido (2026-09-30, cardaniel): antes se pedía SIEMPRE
// `proxy_pool:"premium"` + `headless:"html"` (lo más caro) y no había reintentos,
// así que un 429 de cuota tumbaba la corrida entera. Ahora:
//   - pool y headless son opcionales (default barato, más ajustes del panel),
//   - hay reintentos con backoff en 429/5xx/timeout (respetando Retry-After),
//   - el error se CLASIFICA (cuota / credencial / rate limit / servidor / vacío)
//     con un mensaje accionable, no el cuerpo crudo truncado.

const DECODO_API = "https://scraper-api.decodo.com/v2/scrape";

/** Convierte la credencial ("user:pass" o base64 ya hecho) en header Basic. */
function toAuthHeader(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.toLowerCase().startsWith("basic ")) return v;
  const token = v.includes(":") ? btoa(v) : v;
  return `Basic ${token}`;
}

/**
 * Credencial efectiva de Decodo: **settings del panel** (editable desde
 * Configuración → Scraping) y, si está vacía, el secret `DECODO_AUTH` del
 * worker. Si settings tiene un valor viejo, TAPA al secret → el panel muestra el
 * origen para detectarlo.
 */
export async function resolveDecodoAuth(env: Env): Promise<string | null> {
  try {
    const v = await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.decodoAuth);
    if (v && v.trim()) return v.trim();
  } catch {
    /* sin DB: cae al env */
  }
  const raw = (env.DECODO_AUTH ?? "").trim();
  return raw || null;
}

/** De dónde sale la credencial que se está usando. */
export async function decodoAuthOrigin(env: Env): Promise<"panel" | "worker" | "none"> {
  try {
    const v = await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.decodoAuth);
    if (v && v.trim()) return "panel";
  } catch {
    /* sin DB */
  }
  return (env.DECODO_AUTH ?? "").trim() ? "worker" : "none";
}

export async function decodoConfigured(env: Env): Promise<boolean> {
  return (await resolveDecodoAuth(env)) !== null;
}

/** Motivo normalizado del fallo, para que el panel diga QUÉ hacer. */
export type DecodoErrorCode = "config" | "auth" | "quota" | "rate_limit" | "server" | "empty" | "timeout" | "unknown";

export type ScrapeResult =
  | { ok: true; content: string; statusCode: number }
  | { ok: false; error: string; code: DecodoErrorCode; status?: number };

export interface ScrapeOptions {
  /** false → pide el contenido sin convertir a Markdown (HTML/XML crudo). */
  markdown?: boolean;
  timeoutMs?: number;
  /** Pool de proxies. Default "standard" (barato); "premium" solo para sitios duros. */
  proxyPool?: "standard" | "premium";
  /** Render con navegador. Default false; true solo si el sitio necesita JS. */
  headless?: boolean;
  /** Intentos ante 429/5xx/timeout. Default 3 (máx 5). */
  attempts?: number;
}

function classifyHttp(status: number, detail: string): { code: DecodoErrorCode; error: string } {
  if (status === 401 || status === 403) {
    return { code: "auth", error: "Credencial de Decodo inválida o sin permiso (revisá la key en Configuración → Scraping)." };
  }
  if (status === 429) {
    const quota = /used all requests|subscription period|quota|exceeded your|plan/i.test(detail);
    return quota
      ? {
          code: "quota",
          error:
            "Tu plan/cuota de Decodo no tiene requests disponibles (o la suscripción venció). Entrá a tu panel de Decodo y revisá el plan/saldo.",
        }
      : { code: "rate_limit", error: "Decodo frenó por rate limit (muchas requests seguidas). Se reintentó; probá más tarde." };
  }
  if (status >= 500) return { code: "server", error: `Decodo devolvió ${status} (error del proveedor).` };
  return { code: "unknown", error: `HTTP ${status} ${detail.slice(0, 200)}`.trim() };
}

function retryAfterMs(res: Response): number | undefined {
  const ra = res.headers.get("retry-after");
  if (!ra) return undefined;
  const secs = Number.parseInt(ra, 10);
  return Number.isFinite(secs) ? Math.min(secs, 30) * 1000 : undefined;
}

function isRetryable(code: DecodoErrorCode): boolean {
  return code === "rate_limit" || code === "server" || code === "timeout" || code === "unknown";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Scrapea una URL y devuelve su contenido. Fail-soft: nunca lanza.
 *
 * `markdown: true` (default) trae Markdown (KB). Con `markdown: false` trae
 * HTML/XML crudo (p. ej. leer `og:image` o un sitemap).
 *
 * FALLBACK (bug real 2026-09-14): los sitemaps son XML y el conversor a Markdown
 * los deja en blanco → Decodo 200 con `content` vacío. Si viene vacío pidiendo
 * Markdown, se reintenta UNA vez sin markdown. (Igual, hoy los sitemaps se bajan
 * directo — ver src/integrations/directFetch.ts.)
 */
export async function scrapeUrl(env: Env, url: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const raw = await resolveDecodoAuth(env);
  const auth = raw ? toAuthHeader(raw) : null;
  if (!auth) return { ok: false, error: "DECODO_AUTH no configurado", code: "config" };

  const wantMarkdown = opts.markdown ?? true;
  const proxyPool = opts.proxyPool ?? "standard";
  const headless = opts.headless === true;
  const maxAttempts = Math.max(1, Math.min(opts.attempts ?? 3, 5));

  const call = async (markdown: boolean): Promise<ScrapeResult> => {
    const res = await fetch(DECODO_API, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        url,
        proxy_pool: proxyPool,
        headless: headless ? "html" : undefined,
        markdown,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const { code, error } = classifyHttp(res.status, detail);
      // Rate limit/5xx → reintentable; guardamos el Retry-After para el backoff.
      if (code === "rate_limit" || code === "server") {
        const wait = retryAfterMs(res);
        if (wait) await sleep(wait);
      }
      return { ok: false, error, code, status: res.status };
    }

    const json = (await res.json()) as { results?: { content?: unknown; status_code?: number }[] };
    const first = json.results?.[0];
    const content = typeof first?.content === "string" ? first.content : "";
    const statusCode = first?.status_code ?? 0;
    if (!content.trim()) return { ok: false, error: `sin contenido (status ${statusCode})`, code: "empty", status: statusCode };
    return { ok: true, content, statusCode };
  };

  // Reintentos con backoff exponencial + jitter.
  const withRetry = async (markdown: boolean): Promise<ScrapeResult> => {
    let last: ScrapeResult = { ok: false, error: "sin intentos", code: "unknown" };
    for (let i = 0; i < maxAttempts; i++) {
      try {
        last = await call(markdown);
        if (last.ok) return last;
        if (!isRetryable(last.code) || i === maxAttempts - 1) return last;
      } catch (e) {
        last = { ok: false, error: String((e as Error)?.message ?? e), code: "timeout" };
        if (i === maxAttempts - 1) return last;
      }
      await sleep(800 * Math.pow(3, i) + Math.floor(Math.random() * 300));
    }
    return last;
  };

  const first = await withRetry(wantMarkdown);
  if (first.ok || !wantMarkdown) return first;
  // Vacío pidiendo Markdown (sitemap XML) → reintento crudo.
  if (first.code !== "empty") return first;
  const retry = await withRetry(false);
  if (retry.ok) {
    console.log(`[decodo] ${url}: vacío en Markdown → recuperado sin markdown (${retry.content.length} chars)`);
  }
  return retry;
}
