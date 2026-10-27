import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { scrapeUrl } from "./decodo";
import { aisaScrape, aisaMap, aisaConfigured } from "./aisaScrape";
import { fetchSitemapDirect, looksLikeSitemap, looksLikeXml } from "./directFetch";

/**
 * Conmutador de scraping del inventario (Web Sync + fichas).
 *
 * Elige la fuente según el setting **`scrape_provider`**:
 *   - `"auto"`   (default) → **Decodo** → directo (solo sitemaps, gratis) → AIsa
 *   - `"aisa"`   → **AIsa** (Firecrawl) y punto
 *   - `"decodo"` → **Decodo** y punto
 *
 * Decodo es el proveedor PRINCIPAL (HTML/JSON-LD autoritativo para precio,
 * millas, versión y descripción). El fetch directo queda como ahorro para los
 * sitemaps XML; AIsa es la salida cuando Decodo falla o se queda sin cuota.
 */
export type ScrapeProvider = "auto" | "aisa" | "decodo";

export async function resolveScrapeProvider(env: Env): Promise<ScrapeProvider> {
  try {
    const v = (await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.scrapeProvider))?.trim();
    if (v === "aisa" || v === "decodo") return v;
  } catch {
    /* sin DB → auto */
  }
  return "auto";
}

/** ¿Hay alguna fuente de scraping utilizable? */
export async function scraperConfigured(env: Env): Promise<boolean> {
  if (await aisaConfigured(env)) return true;
  try {
    const decodo = (await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.decodoAuth))?.trim();
    if (decodo) return true;
  } catch {
    /* sin DB */
  }
  return Boolean((env.DECODO_AUTH ?? "").trim());
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/** Construye un XML equivalente a un sitemap con las URLs dadas. */
function sitemapXmlFromLinks(links: string[]): string {
  const locs = links.map((u) => `  <url><loc>${u.replace(/&/g, "&amp;")}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs}\n</urlset>`;
}

export interface FeedResult {
  ok: boolean;
  content?: string;
  /** De dónde salió el contenido (para mostrarlo en el panel). */
  source?: "directo" | "aisa-map" | "aisa" | "decodo";
  error?: string;
  code?: string;
}

/**
 * Trae el contenido del feed configurado (sitemap/XML o página de texto).
 * Devuelve el `content` crudo para que los parsers de inventario lo procesen
 * igual que siempre (un sitemap sintetizado a partir de `map` es XML válido).
 */
export async function scrapeForFeed(env: Env, url: string): Promise<FeedResult> {
  const provider = await resolveScrapeProvider(env);
  const isSitemap = looksLikeSitemap(url);
  let directNote: string | undefined;
  let lastCode: string | undefined;

  // 1) DECODO (principal). Los sitemaps se piden SIN markdown (son XML); un feed
  //    de texto/listicle se pide en markdown, como lo espera el parser.
  if (provider !== "aisa") {
    const r = await scrapeUrl(env, url, isSitemap ? { markdown: false } : {});
    if (r.ok) return { ok: true, content: r.content, source: "decodo" };
    lastCode = r.code;
    directNote = `Decodo: ${r.error}`;
    if (provider === "decodo") return { ok: false, error: r.error, code: r.code };
  }

  // 2) Directo (gratis): solo sitemaps y solo en `auto`. Sirve cuando el sitio
  //    NO bloquea al Worker. Exigimos XML de verdad (un WAF puede devolver 200
  //    con una página HTML de challenge).
  if (provider === "auto" && isSitemap) {
    const direct = await fetchSitemapDirect(url, env);
    const text = direct.text ?? "";
    if (direct.ok && text.trim() && looksLikeXml(text)) return { ok: true, content: text, source: "directo" };
    directNote = `${directNote ?? ""}${
      directNote ? "; " : ""
    }${direct.ok ? "fetch directo: respondió algo que no es XML (¿challenge del WAF?)" : `fetch directo: ${direct.error ?? `HTTP ${direct.status}`}`}`;
  }

  // 3) AIsa (Firecrawl): fallback en `auto`, único proveedor en `aisa`.
  if (await aisaConfigured(env)) {
    if (isSitemap) {
      // Descubrimiento: `map` del origen → sitemap sintetizado con las fichas.
      const m = await aisaMap(env, originOf(url), 1000);
      if (m.ok && m.links.length > 0) {
        const inv = m.links.filter((u) => /\/inventory\//i.test(u));
        if (inv.length > 0) return { ok: true, content: sitemapXmlFromLinks(inv), source: "aisa-map" };
        return { ok: false, error: "AIsa map: no encontró fichas de inventario", code: "empty" };
      }
      if (provider === "aisa") return { ok: false, error: m.error ?? "AIsa map falló", code: m.code };
      lastCode = m.code ?? lastCode;
      directNote = `${directNote ?? ""}${directNote ? "; " : ""}AIsa map: ${m.error ?? "falló"}`;
    } else {
      const s = await aisaScrape(env, url);
      if (s.ok && s.markdown) return { ok: true, content: s.markdown, source: "aisa" };
      if (provider === "aisa") return { ok: false, error: s.error ?? "AIsa falló", code: s.code };
      lastCode = s.code ?? lastCode;
      directNote = `${directNote ?? ""}${directNote ? "; " : ""}AIsa: ${s.error ?? "falló"}`;
    }
  }

  return {
    ok: false,
    error: directNote ?? "sin proveedor de scraping disponible",
    code: lastCode ?? "unknown",
  };
}

export interface DetailsResult {
  ok: boolean;
  /** `html` (fuente autoritativa para precio/millas) o `markdown` (AIsa). */
  kind: "html" | "markdown";
  content?: string;
  error?: string;
  code?: string;
}

/**
 * Trae una ficha para enriquecer precio/millas/foto/descripción.
 *
 * Orden: **Decodo** (HTML/JSON-LD, autoritativo) → AIsa (markdown) en `auto`.
 * Con `decodo` no hay fallback; con `aisa` solo se usa AIsa.
 */
export async function scrapeForDetails(
  env: Env,
  url: string,
  opts: { timeoutMs?: number; markdown?: boolean } = {},
): Promise<DetailsResult> {
  const provider = await resolveScrapeProvider(env);
  const wantMd = opts.markdown ?? false;

  // 1) Decodo (principal).
  if (provider !== "aisa") {
    const r = await scrapeUrl(env, url, { markdown: wantMd, timeoutMs: opts.timeoutMs });
    if (r.ok) return { ok: true, kind: wantMd ? "markdown" : "html", content: r.content };
    if (provider === "decodo") {
      return { ok: false, kind: wantMd ? "markdown" : "html", error: r.error, code: r.code };
    }
    // `auto`: si Decodo falla (p. ej. cuota), caemos a AIsa.
    if (await aisaConfigured(env)) {
      const s = await aisaScrape(env, url);
      if (s.ok && s.markdown) return { ok: true, kind: "markdown", content: s.markdown };
      return { ok: false, kind: "markdown", error: s.error ?? r.error, code: s.code ?? r.code };
    }
    return { ok: false, kind: wantMd ? "markdown" : "html", error: r.error, code: r.code };
  }

  // 2) AIsa como único proveedor.
  const s = await aisaScrape(env, url);
  if (s.ok && s.markdown) return { ok: true, kind: "markdown", content: s.markdown };
  return { ok: false, kind: "markdown", error: s.error, code: s.code };
}
