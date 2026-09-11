import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";

// Cliente de Decodo Scraper API v2 (scraper-api.decodo.com/v2/scrape).
// Se usa SOLO desde src/kb/webSync.ts, y solo si:
//   - el módulo `web_sync` está desbloqueado en la instalación, Y
//   - existe el secret DECODO_AUTH en ESE worker.
// Ambos candados fallan cerrados (ver src/kb/webSync.ts).
//
// Contrato (verificado con la request del cliente):
//   POST /v2/scrape
//   Authorization: Basic <base64(user:pass)>
//   { url, proxy_pool: "premium", headless: "html", markdown: true }
//   → 200 { results: [{ content, status_code, url, ... }] }
//   content viene en Markdown cuando markdown:true → listo para la KB sin parsear.

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
 * worker. Así una instalación limpia puede no tener nada (y el scraping queda
 * apagado) y el dueño puede pegar su propia API key sin redeploy.
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

export async function decodoConfigured(env: Env): Promise<boolean> {
  return (await resolveDecodoAuth(env)) !== null;
}

export type ScrapeResult =
  | { ok: true; content: string; statusCode: number }
  | { ok: false; error: string };

export interface ScrapeOptions {
  /** false → pide el contenido sin convertir a Markdown (HTML crudo si el sitio lo da). */
  markdown?: boolean;
  timeoutMs?: number;
}

/**
 * Scrapea una URL y devuelve su contenido. Fail-soft: cualquier error se
 * devuelve como `{ ok: false }` — nunca lanza.
 *
 * `markdown: true` (default) trae el contenido en Markdown, listo para la KB.
 * Con `markdown: false` el `content` puede venir en HTML — se usa para leer
 * `og:image` de una ficha de auto cuando el Markdown no trae imágenes.
 */
export async function scrapeUrl(env: Env, url: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const raw = await resolveDecodoAuth(env);
  const auth = raw ? toAuthHeader(raw) : null;
  if (!auth) return { ok: false, error: "DECODO_AUTH no configurado" };

  try {
    const res = await fetch(DECODO_API, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({
        url,
        proxy_pool: "premium",
        headless: "html",
        markdown: opts.markdown ?? true,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${detail.slice(0, 200)}` };
    }

    const json = (await res.json()) as {
      results?: { content?: unknown; status_code?: number }[];
    };
    const first = json.results?.[0];
    const content = typeof first?.content === "string" ? first.content : "";
    const statusCode = first?.status_code ?? 0;

    if (!content.trim()) {
      return { ok: false, error: `sin contenido (status ${statusCode})` };
    }
    return { ok: true, content, statusCode };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
