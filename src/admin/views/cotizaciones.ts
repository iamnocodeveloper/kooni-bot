// Cotizaciones (nicho eventos y otros): lista + editor del borrador. El PDF se
// genera al vuelo (GET .../pdf) y se envía/reenvía al cliente por su canal.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { QuotesRepo, QUOTE_STATUSES, type Quote, type QuoteItem, type QuoteStatus } from "../../db/quotes";
import { layout } from "./layout";
import { panelI18n, type T } from "../i18n";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

const STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: "var(--warn)",
  sent: "var(--info)",
  accepted: "var(--ok)",
  rejected: "var(--bad)",
  expired: "var(--dim)",
};

function statusLabel(t: T, s: QuoteStatus): string {
  return t((`cot.st.${s}`) as never);
}

const inputStyle = "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px;width:100%";

function money(n: number): string {
  const r = Math.round(n * 100) / 100;
  return `$${Number.isInteger(r) ? r : r.toFixed(2)}`;
}

export async function renderCotizaciones(env: Env, saved = false): Promise<string> {
  const { t } = await panelI18n(env);
  const rows = await new QuotesRepo(new Db(env.DB)).list(200).catch(() => [] as Quote[]);
  const list = rows
    .map(
      (q) => `<tr style="border-top:1px solid var(--line)">
      <td style="padding:8px 10px;font-size:11px">${esc(q.number ?? "—")}</td>
      <td class="text-cream" style="padding:8px 10px">${esc(q.client_name) || "—"}</td>
      <td class="text-muted" style="padding:8px 10px;font-size:11.5px">${esc(q.event_type) || "—"}${q.event_date ? ` · ${esc(q.event_date)}` : ""}</td>
      <td style="padding:8px 10px;text-align:right">${money(q.total)}</td>
      <td style="padding:8px 10px"><span style="font-size:10px;color:${STATUS_COLOR[q.status]};border:1px solid ${STATUS_COLOR[q.status]};padding:1px 7px">${statusLabel(t, q.status)}</span></td>
      <td style="padding:8px 10px"><a href="/admin/cotizaciones/${encodeURIComponent(q.id)}" class="text-accent" style="font-size:11px;text-decoration:none">${t("cot.open")}</a></td>
    </tr>`,
    )
    .join("");

  const body = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("cot.title")}</h2>
        <p class="text-muted text-[12.5px]">${t("cot.subtitle")}</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">${t("lab.saved")}</div>` : ""}
      <div class="bg-panel border border-line" style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px">
          <thead><tr style="font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)">
            <th style="padding:8px 10px;text-align:left">${t("cot.colNumber")}</th><th style="padding:8px 10px;text-align:left">${t("cot.colClient")}</th>
            <th style="padding:8px 10px;text-align:left">${t("cot.colEvent")}</th><th style="padding:8px 10px;text-align:right">${t("cot.colTotal")}</th>
            <th style="padding:8px 10px;text-align:left">${t("cot.colStatus")}</th><th></th>
          </tr></thead>
          <tbody>${rows.length ? list : `<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--dim)">${t("cot.empty")}</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  return layout({ title: t("cot.title"), activeTab: "cotizaciones", body, env });
}

export async function renderCotizacionEditor(env: Env, quoteId: string): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const repo = new QuotesRepo(db);
  const quote = await repo.get(quoteId);
  if (!quote) return layout({ title: t("cot.title"), activeTab: "cotizaciones", body: `<div class="text-dim">${t("cot.notFound")}</div>`, env });
  const items = await repo.items(quoteId);

  const itemRow = (it: QuoteItem) => `
    <tr>
      <td style="padding:4px"><input name="item_name" value="${esc(it.name)}" style="${inputStyle}"></td>
      <td style="padding:4px"><input name="item_desc" value="${esc(it.description ?? "")}" style="${inputStyle}"></td>
      <td style="padding:4px"><input name="item_qty" type="number" step="1" min="0" value="${it.qty}" style="${inputStyle};width:80px"></td>
      <td style="padding:4px"><input name="item_price" type="number" step="0.01" min="0" value="${it.unit_price}" style="${inputStyle};width:100px"></td>
    </tr>`;

  const emptyRow = `
    <tr>
      <td style="padding:4px"><input name="item_name" value="" style="${inputStyle}"></td>
      <td style="padding:4px"><input name="item_desc" value="" style="${inputStyle}"></td>
      <td style="padding:4px"><input name="item_qty" type="number" step="1" min="0" value="1" style="${inputStyle};width:80px"></td>
      <td style="padding:4px"><input name="item_price" type="number" step="0.01" min="0" value="0" style="${inputStyle};width:100px"></td>
    </tr>`;

  const field = (label: string, inner: string) => `<label style="font-size:11px;color:var(--muted)">${label}${inner}</label>`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("cot.title")} ${esc(quote.number ?? "")}</h2>
        <span style="font-size:10px;color:${STATUS_COLOR[quote.status]};border:1px solid ${STATUS_COLOR[quote.status]};padding:2px 8px">${statusLabel(t, quote.status)}</span>
        <a href="/admin/cotizaciones/${encodeURIComponent(quote.id)}/pdf" target="_blank" class="text-accent" style="font-size:12px;text-decoration:none;margin-left:auto">${t("cot.viewPdf")}</a>
      </div>

      <form method="POST" action="/admin/cotizaciones/${encodeURIComponent(quote.id)}/save" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
          ${field(t("cot.client"), `<input name="client_name" value="${esc(quote.client_name ?? "")}" style="${inputStyle}">`)}
          ${field(t("cot.contact"), `<input name="client_contact" value="${esc(quote.client_contact ?? "")}" style="${inputStyle}">`)}
          ${field(t("cot.event"), `<input name="event_type" value="${esc(quote.event_type ?? "")}" style="${inputStyle}">`)}
          ${field(t("cot.eventDate"), `<input name="event_date" value="${esc(quote.event_date ?? "")}" style="${inputStyle}">`)}
          ${field(t("cot.place"), `<input name="event_place" value="${esc(quote.event_place ?? "")}" style="${inputStyle}">`)}
          ${field(t("cot.guests"), `<input name="guests" type="number" min="0" value="${quote.guests ?? ""}" style="${inputStyle}">`)}
          ${field(t("cot.currency"), `<input name="currency" value="${esc(quote.currency)}" style="${inputStyle}">`)}
          ${field(t("cot.validUntil"), `<input name="valid_until" value="${esc(quote.valid_until ?? "")}" style="${inputStyle}">`)}
          ${field(t("cot.discount"), `<input name="discount" type="number" step="0.01" min="0" value="${quote.discount}" style="${inputStyle}">`)}
          ${field(t("cot.tax"), `<input name="tax" type="number" step="0.01" min="0" value="${quote.tax}" style="${inputStyle}">`)}
          ${field(t("cot.deposit"), `<input name="deposit" type="number" step="0.01" min="0" value="${quote.deposit}" style="${inputStyle}">`)}
        </div>

        <div class="bg-panel border border-line" style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)">
              <th style="padding:6px 8px;text-align:left">${t("cot.itemConcept")}</th><th style="padding:6px 8px;text-align:left">${t("cot.itemDesc")}</th>
              <th style="padding:6px 8px;text-align:left">${t("cot.itemQty")}</th><th style="padding:6px 8px;text-align:left">${t("cot.itemPrice")}</th>
            </tr></thead>
            <tbody id="quote-items">${items.length ? items.map(itemRow).join("") : ""}${emptyRow}</tbody>
          </table>
        </div>
        <button type="button" onclick="document.getElementById('quote-items').insertAdjacentHTML('beforeend', ${JSON.stringify(
          `<tr><td style="padding:4px"><input name="item_name" value="" style="${inputStyle}"></td><td style="padding:4px"><input name="item_desc" value="" style="${inputStyle}"></td><td style="padding:4px"><input name="item_qty" type="number" step="1" min="0" value="1" style="${inputStyle};width:80px"></td><td style="padding:4px"><input name="item_price" type="number" step="0.01" min="0" value="0" style="${inputStyle};width:100px"></td></tr>`,
        )})" class="chip" style="align-self:flex-start;font-size:11.5px;cursor:pointer;color:var(--accent-2);background:var(--panel2);border:1px dashed var(--linelit);padding:5px 11px">${t("cot.addItem")}</button>

        ${field(t("cot.notes"), `<textarea name="notes" rows="2" style="${inputStyle}">${esc(quote.notes ?? "")}</textarea>`)}

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 18px;font-size:12.5px;font-weight:700;cursor:pointer">${t("cot.save")}</button>
        </div>
      </form>

      <div class="bg-panel border border-line" style="padding:12px 14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <form method="POST" action="/admin/cotizaciones/${encodeURIComponent(quote.id)}/send" style="display:inline">
          <button type="submit" style="background:var(--ok);color:var(--on-accent);border:none;padding:9px 18px;font-size:12.5px;font-weight:700;cursor:pointer">${quote.sent_count > 0 ? t("cot.resend") : t("cot.send")}</button>
        </form>
        <form method="POST" action="/admin/cotizaciones/${encodeURIComponent(quote.id)}/status" style="display:inline-flex;gap:6px;align-items:center">
          <select name="status" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12px">
            ${QUOTE_STATUSES.map((s) => `<option value="${s}" ${quote.status === s ? "selected" : ""}>${statusLabel(t, s)}</option>`).join("")}
          </select>
          <button type="submit" style="background:var(--panel2);color:var(--cream);border:1px solid var(--linelit);padding:8px 14px;font-size:12px;cursor:pointer">${t("cot.changeStatus")}</button>
        </form>
        ${quote.sent_count > 0 ? `<span class="text-dim" style="font-size:11px">${t("cot.sentTimes", { n: String(quote.sent_count) })}</span>` : ""}
      </div>
    </div>`;
  return layout({ title: `${t("cot.title")} ${quote.number ?? ""}`, activeTab: "cotizaciones", body, env });
}
