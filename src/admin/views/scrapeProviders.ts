// "Quién lee el sitio": mapa visual de los dos proveedores de scraping.
//
// El dueño ve, en lenguaje llano, QUÉ hace Decodo, QUÉ hace AIsa, cuál tiene
// llave configurada y cuál participa según el modo elegido (`scrape_provider`).
// Se usa en Configuración → Scraping y en el registro de scraping, para que la
// respuesta no dependa de leer el código.
import type { Env } from "../../env";
import { SETTING_KEYS } from "../../db/settings";
import type { T } from "../i18n";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

export type ScrapeProviderId = "auto" | "aisa" | "decodo";

/** Modo efectivo (misma normalización que `resolveScrapeProvider`). */
export function scrapeProviderOf(settings: Record<string, string>): ScrapeProviderId {
  const v = (settings[SETTING_KEYS.scrapeProvider] ?? "").trim();
  return v === "aisa" || v === "decodo" ? v : "auto";
}

interface CredentialState {
  ok: boolean;
  tail: string;
  origin: string;
}

/** Credencial efectiva de cada proveedor (mismas reglas que el backend). */
export function scrapeCredentials(
  env: Env,
  settings: Record<string, string>,
): { decodo: CredentialState; aisa: CredentialState } {
  const decodoSetting = (settings[SETTING_KEYS.decodoAuth] ?? "").trim();
  const decodoEnv = (env.DECODO_AUTH ?? "").trim();
  const decodoVal = decodoSetting || decodoEnv;

  const aisaSetting = (settings[SETTING_KEYS.aisaApiKey] ?? "").trim();
  const aisaLlm = (settings[SETTING_KEYS.llmApiKey] ?? "").trim();
  const aisaEnv = (env.AISA_API_KEY ?? "").trim();
  const aisaVal = aisaSetting || aisaLlm || aisaEnv;

  return {
    decodo: {
      ok: Boolean(decodoVal),
      tail: decodoVal.slice(-4),
      origin: decodoSetting ? "panel" : decodoEnv ? "worker (secret)" : "",
    },
    aisa: {
      ok: Boolean(aisaVal),
      tail: aisaVal.slice(-4),
      origin: aisaSetting ? "panel" : aisaLlm ? "LLM" : aisaEnv ? "worker (secret)" : "",
    },
  };
}

function card(opts: {
  t: T;
  name: string;
  tag: string;
  what: string;
  role: string;
  cred: CredentialState;
  primary: boolean;
  compact: boolean;
}): string {
  const { t, name, tag, what, role, cred, primary, compact } = opts;
  const border = primary ? "var(--accent)" : "var(--line)";
  const bg = primary ? "var(--panel2)" : "var(--panel)";
  const keyLine = cred.ok
    ? `<span style="color:var(--ok)">● ${esc(t("scrape.prov.keyOk", { tail: cred.tail, src: cred.origin }))}</span>`
    : `<span style="color:var(--dim)">○ ${esc(t("scrape.prov.keyMissing"))}</span>`;
  return `
    <div style="flex:1;min-width:250px;border:1px solid ${border};background:${bg};padding:${compact ? "11px 13px" : "14px 16px"};display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="font-display font-semibold" style="font-size:13px;color:var(--cream)">${esc(name)}</span>
        ${primary ? `<span style="font-size:9px;letter-spacing:.1em;color:var(--accent);border:1px solid var(--accent);padding:2px 6px;font-weight:700">${esc(t("scrape.prov.inUse"))}</span>` : ""}
        <span class="text-[10.5px]" style="margin-left:auto">${keyLine}</span>
      </div>
      <p class="font-mono text-[10.5px]" style="color:var(--accent2);margin:0">${esc(tag)}</p>
      <p class="text-[11.5px]" style="color:var(--muted);margin:0;line-height:1.5">${esc(what)}</p>
      <p class="text-[11px]" style="color:var(--dim);margin:0">${esc(role)}</p>
    </div>`;
}

export interface ScrapeProvidersOptions {
  compact?: boolean;
}

export function renderScrapeProviders(
  env: Env,
  settings: Record<string, string>,
  t: T,
  opts: ScrapeProvidersOptions = {},
): string {
  const mode = scrapeProviderOf(settings);
  const cred = scrapeCredentials(env, settings);
  const compact = opts.compact === true;

  const decodoRole =
    mode === "decodo"
      ? t("scrape.prov.decodo.role.only")
      : mode === "auto"
        ? t("scrape.prov.decodo.role.auto")
        : t("scrape.prov.decodo.role.off");
  const aisaRole =
    mode === "aisa"
      ? t("scrape.prov.aisa.role.only")
      : mode === "auto"
        ? t("scrape.prov.aisa.role.auto")
        : t("scrape.prov.aisa.role.off");

  const modeName =
    mode === "aisa" ? "AIsa" : mode === "decodo" ? "Decodo" : t("scrape.prov.mode.auto");

  const step = (label: string, state: "primary" | "on" | "off"): string => {
    const color = state === "primary" ? "var(--accent2)" : state === "on" ? "var(--cream)" : "var(--dim)";
    const border = state === "primary" ? "var(--accent)" : "var(--line)";
    const bg = state === "off" ? "transparent" : "var(--panel2)";
    const opacity = state === "off" ? "0.55" : "1";
    return `<span class="font-mono" style="font-size:10.5px;color:${color};border:1px solid ${border};background:${bg};padding:3px 8px;opacity:${opacity}">${esc(label)}</span>`;
  };
  const arrow = `<span style="color:var(--dim);font-size:10.5px">→</span>`;

  const decodoState = mode === "auto" ? "primary" : mode === "decodo" ? "primary" : "off";
  const directState = mode === "auto" ? "on" : "off";
  const aisaState = mode === "aisa" ? "primary" : mode === "auto" ? "on" : "off";

  const note =
    mode === "aisa"
      ? t("scrape.prov.note.aisa")
      : mode === "decodo"
        ? t("scrape.prov.note.decodo")
        : t("scrape.prov.note.auto");

  return `
    <div class="bg-panel border" style="padding:${compact ? "14px 16px" : "18px 20px"};display:flex;flex-direction:column;gap:11px">
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:220px">
          <h3 class="font-display font-semibold text-[13.5px] text-cream">${esc(t("scrape.prov.title"))}</h3>
          <p class="text-dim text-[11.5px]" style="margin:0">${esc(t("scrape.prov.help"))}</p>
        </div>
        <span style="font-size:10px;letter-spacing:.1em;color:var(--ok);border:1px solid var(--ok);background:var(--ok-soft);padding:3px 9px;font-weight:700">${esc(t("scrape.prov.now", { name: modeName }))}</span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${card({
          t,
          name: t("scrape.prov.decodo.name"),
          tag: t("scrape.prov.decodo.tag"),
          what: t("scrape.prov.decodo.what"),
          role: decodoRole,
          cred: cred.decodo,
          primary: decodoState === "primary",
          compact,
        })}
        ${card({
          t,
          name: t("scrape.prov.aisa.name"),
          tag: t("scrape.prov.aisa.tag"),
          what: t("scrape.prov.aisa.what"),
          role: aisaRole,
          cred: cred.aisa,
          primary: aisaState === "primary",
          compact,
        })}
      </div>
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:10px">
        <span class="text-[10.5px]" style="color:var(--dim);letter-spacing:.06em;text-transform:uppercase">${esc(t("scrape.prov.chain"))}</span>
        ${step(t("scrape.prov.chain.decodo"), decodoState)}
        ${arrow}
        ${step(t("scrape.prov.chain.direct"), directState)}
        ${arrow}
        ${step(t("scrape.prov.chain.aisa"), aisaState)}
        <span class="text-[11px]" style="color:var(--muted);margin-left:auto">${esc(note)}</span>
      </div>
    </div>`;
}
