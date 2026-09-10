import type { Env } from "../env";

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

/** Header Authorization a partir de DECODO_AUTH ("user:pass" o el base64 ya hecho). */
function authHeader(env: Env): string | null {
  const raw = (env.DECODO_AUTH ?? "").trim();
  if (!raw) return null;
  if (raw.toLowerCase().startsWith("basic ")) return raw;
  const token = raw.includes(":") ? btoa(raw) : raw;
  return `Basic ${token}`;
}

export function decodoConfigured(env: Env): boolean {
  return authHeader(env) !== null;
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
  const auth = authHeader(env);
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
