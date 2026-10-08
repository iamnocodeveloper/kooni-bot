import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import type { Quote, QuoteItem } from "../db/quotes";

/**
 * Plantilla de la cotización (HTML editable desde el panel) → PDF.
 *
 * Marcadores simples: {{business_name}}, {{logo_url}}, {{number}}, {{date}},
 * {{client_name}}… y un bloque repetible {{#items}} … {{/items}} con {{name}},
 * {{description}}, {{qty}}, {{unit_price}}, {{total}}. Si el dueño no guarda
 * plantilla, se usa DEFAULT_QUOTE_TEMPLATE.
 */

export const DEFAULT_QUOTE_TEMPLATE = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #12211f; margin: 0; padding: 40px; font-size: 13px; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #14b8a6; padding-bottom: 16px; }
  .brand { font-size: 22px; font-weight: 700; color: #0f766e; }
  .logo { max-height: 64px; }
  h1 { font-size: 18px; margin: 24px 0 4px; }
  .muted { color: #5b6b68; }
  .meta { display: flex; gap: 32px; margin: 16px 0 24px; flex-wrap: wrap; }
  .meta div { min-width: 160px; }
  .meta .k { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #8aa19d; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #8aa19d; border-bottom: 2px solid #d7e3e1; padding: 6px 8px; }
  td { padding: 8px; border-bottom: 1px solid #eef4f3; vertical-align: top; }
  td.num, th.num { text-align: right; }
  .totals { margin-top: 16px; margin-left: auto; width: 260px; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 8px; }
  .totals .grand { border-top: 2px solid #14b8a6; font-weight: 700; font-size: 15px; color: #0f766e; }
  .notes { margin-top: 24px; white-space: pre-wrap; }
  .foot { margin-top: 36px; font-size: 11px; color: #8aa19d; border-top: 1px solid #eef4f3; padding-top: 12px; white-space: pre-wrap; }
</style></head><body>
  <div class="head">
    <div class="brand">{{business_name}}</div>
    {{logo_tag}}
  </div>
  <h1>Cotización {{number}}</h1>
  <div class="muted">Fecha: {{date}} · Válida hasta: {{valid_until}}</div>
  <div class="meta">
    <div><div class="k">Cliente</div><div>{{client_name}}</div></div>
    <div><div class="k">Contacto</div><div>{{client_contact}}</div></div>
    <div><div class="k">Evento</div><div>{{event_type}}</div></div>
    <div><div class="k">Fecha del evento</div><div>{{event_date}}</div></div>
    <div><div class="k">Lugar</div><div>{{event_place}}</div></div>
    <div><div class="k">Invitados</div><div>{{guests}}</div></div>
  </div>
  <table>
    <thead><tr><th>Concepto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
    <tbody>
    {{#items}}
      <tr><td>{{name}}{{description_html}}</td><td class="num">{{qty}}</td><td class="num">{{unit_price}}</td><td class="num">{{total}}</td></tr>
    {{/items}}
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>{{subtotal}}</span></div>
    <div class="row"><span>Descuento</span><span>-{{discount}}</span></div>
    <div class="row"><span>Impuestos</span><span>{{tax}}</span></div>
    <div class="row grand"><span>Total</span><span>{{total}}</span></div>
    <div class="row muted"><span>Anticipo</span><span>{{deposit}}</span></div>
  </div>
  {{notes_html}}
  <div class="foot">{{footer}}</div>
</body></html>`;

export interface QuoteRenderData {
  businessName: string;
  logoUrl?: string;
  quote: Quote;
  items: QuoteItem[];
  footer?: string;
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function money(n: number, currency: string): string {
  const sym = currency === "MXN" || currency === "USD" ? "$" : "";
  const r = Math.round(n * 100) / 100;
  const num = Number.isInteger(r) ? String(r) : r.toFixed(2);
  return `${sym}${num}`;
}

function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 10);
}

/** Rellena la plantilla HTML con los datos de la cotización. */
export function renderQuoteHtml(template: string, data: QuoteRenderData): string {
  const { quote, items } = data;
  const cur = quote.currency || "USD";

  // Bloque de ítems: si el template lo declara, se reemplaza; si no, se ignora.
  let html = template;
  const blockMatch = html.match(/\{\{#items\}\}([\s\S]*?)\{\{\/items\}\}/);
  if (blockMatch) {
    const rowTpl = blockMatch[1];
    const rows = items
      .map((it) => {
        let row = rowTpl;
        row = row.replace(/\{\{name\}\}/g, esc(it.name));
        row = row.replace(/\{\{description_html\}\}/g, it.description ? `<div class="muted" style="font-size:11px">${esc(it.description)}</div>` : "");
        row = row.replace(/\{\{description\}\}/g, esc(it.description));
        row = row.replace(/\{\{qty\}\}/g, esc(String(it.qty)));
        row = row.replace(/\{\{unit_price\}\}/g, money(it.unit_price, cur));
        row = row.replace(/\{\{total\}\}/g, money(it.total, cur));
        return row;
      })
      .join("");
    html = html.replace(blockMatch[0], rows);
  }

  const map: Record<string, string> = {
    business_name: esc(data.businessName),
    logo_url: esc(data.logoUrl ?? ""),
    logo_tag: data.logoUrl ? `<img class="logo" src="${esc(data.logoUrl)}" alt="">` : "",
    number: esc(quote.number ?? ""),
    date: fmtDate(quote.created_at),
    valid_until: quote.valid_until ? esc(quote.valid_until) : "—",
    client_name: esc(quote.client_name) || "—",
    client_contact: esc(quote.client_contact) || "—",
    event_type: esc(quote.event_type) || "—",
    event_date: esc(quote.event_date) || "—",
    event_place: esc(quote.event_place) || "—",
    guests: quote.guests != null ? esc(String(quote.guests)) : "—",
    currency: esc(cur),
    subtotal: money(quote.subtotal, cur),
    discount: money(quote.discount, cur),
    tax: money(quote.tax, cur),
    total: money(quote.total, cur),
    deposit: money(quote.deposit, cur),
    notes: esc(quote.notes),
    notes_html: quote.notes ? `<div class="notes"><b>Notas</b><br>${esc(quote.notes)}</div>` : "",
    footer: esc(data.footer ?? ""),
  };
  for (const [k, v] of Object.entries(map)) html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  return html;
}

/** Carga la plantilla guardada (o la default) y arma el HTML de una cotización. */
export async function buildQuoteHtml(env: Env, quote: Quote, items: QuoteItem[]): Promise<string> {
  let template = DEFAULT_QUOTE_TEMPLATE;
  let footer = "";
  try {
    const settings = new SettingsRepo(new Db(env.DB));
    const saved = await settings.get(SETTING_KEYS.quoteTemplateHtml);
    if (saved && saved.trim()) template = saved;
    const defaultsRaw = await settings.get(SETTING_KEYS.quoteDefaults);
    if (defaultsRaw) {
      const d = JSON.parse(defaultsRaw);
      if (typeof d?.footer === "string") footer = d.footer;
    }
  } catch {
    // sin settings → plantilla por defecto
  }
  return renderQuoteHtml(template, {
    businessName: env.BUSINESS_NAME || env.BOT_NAME || "Kooni",
    logoUrl: env.BRAND_LOGO_URL,
    quote,
    items,
    footer,
  });
}
