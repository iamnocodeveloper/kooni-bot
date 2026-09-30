import type { Env } from "../env";

/**
 * Fetch directo (sin Decodo) para recursos públicos y estáticos — típicamente
 * los **sitemaps XML** de los concesionarios. Antes todo pasaba por Decodo, así
 * que la cuota de Decodo decidía si el inventario se actualizaba o no. Un sitemap
 * es texto plano servido por el propio sitio: bajarlo directo cuesta 0 requests
 * de Decodo y es mucho más rápido.
 *
 * Fail-soft: nunca lanza; devuelve `{ ok:false }` con el motivo.
 */
export interface FetchTextResult {
  ok: boolean;
  status: number;
  text?: string;
  error?: string;
}

export interface FetchTextOptions {
  timeoutMs?: number;
  userAgent?: string;
  maxBytes?: number;
  accept?: string;
}

// UA de navegador real: muchos sitios rechazan el UA por defecto del Worker.
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<FetchTextResult> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": opts.userAgent ?? DEFAULT_UA,
        Accept: opts.accept ?? "application/xml,text/xml,text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const buf = await res.arrayBuffer();
    const sliced = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const text = new TextDecoder().decode(sliced);
    return { ok: true, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, error: String((e as Error)?.message ?? e) };
  }
}

/** ¿La URL es (probablemente) un sitemap/XML? Se puede bajar directo. */
export function looksLikeSitemap(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return p.includes("sitemap") || p.endsWith(".xml");
  } catch {
    return /sitemap|\.xml/i.test(url);
  }
}

/** El contenido parece XML (sitemap) y no HTML. */
export function looksLikeXml(text: string): boolean {
  return /^\s*<\?xml|<urlset|<sitemapindex|<loc>/i.test(text.slice(0, 2000));
}

/**
 * Baja un sitemap/XML directo. Si el sitio bloquea al Worker (403 / WAF /
 * timeout), devuelve `ok:false` con el motivo para que el llamador caiga a
 * Decodo **y pueda reportar por qué** (antes el motivo solo iba al log).
 * Un reintento: algunos WAF bloquean de forma intermitente.
 */
export async function fetchSitemapDirect(url: string, env?: Env): Promise<FetchTextResult> {
  void env;
  const opts = { timeoutMs: 25_000, accept: "application/xml,text/xml,*/*;q=0.8" };
  const first = await fetchText(url, opts);
  if (first.ok && first.text && first.text.trim()) return first;
  await new Promise((r) => setTimeout(r, 700));
  const second = await fetchText(url, opts);
  if (second.ok && second.text && second.text.trim()) return second;
  const status = second.status || first.status;
  const error = second.error ?? first.error ?? `HTTP ${status}`;
  return { ok: false, status, error };
}
