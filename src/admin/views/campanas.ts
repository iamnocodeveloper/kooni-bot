// "Campañas" — envío segmentado por WhatsApp respetando las reglas del canal:
// dentro de la ventana de 24h va mensaje free-form (gratis); fuera va plantilla
// HSM aprobada (Twilio Content API) que gasta el tope diario del número
// (default 250). La página enseña ambos números ANTES de mandar para que el
// dueño planee — la cuota es oro el día del evento.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { layout } from "./layout";
import { panelI18n, type T } from "../i18n";
import { SEGMENTS, segmentCounts } from "../../segments";
import {
  listContentTemplates,
  templatesSentLast24h,
  dailyTemplateCap,
  campaignHistory,
} from "../../campaigns";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

function fmtAgo(t: T, ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 60) return t("camp.agoMin", { min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("camp.agoH", { h });
  return t("camp.agoD", { d: Math.floor(h / 24) });
}

export async function renderCampanas(
  env: Env,
  q: Record<string, string | undefined> = {},
): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const [counts, templates, spent, history] = await Promise.all([
    segmentCounts(db),
    listContentTemplates(env).catch(() => []),
    templatesSentLast24h(db),
    campaignHistory(db),
  ]);
  const cap = dailyTemplateCap(env);
  const pct = Math.min(100, Math.round((spent / cap) * 100));

  const banner = q.ok
    ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);padding:12px 16px;margin-bottom:18px;font-size:12.5px">
        ${t("camp.sentBanner", { ff: esc(q.ff ?? "0"), tp: esc(q.tp ?? "0"), dup: esc(q.dup ?? "0"), quota: esc(q.quota ?? "0"), fail: esc(q.fail ?? "0") })}
      </div>`
    : q.err
      ? `<div style="border:1px solid var(--bad);background:var(--bad-soft);padding:12px 16px;margin-bottom:18px;font-size:12.5px">⚠️ ${esc(q.err)}</div>`
      : "";

  const segRows = counts
    .map((s, i) => {
      const def = SEGMENTS.find((d) => d.id === s.id)!;
      return `
      <label style="display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);padding:12px 14px;cursor:pointer;background:var(--panel)">
        <input type="radio" name="segment" value="${esc(s.id)}" ${i === 0 ? "checked" : ""} style="margin-top:3px">
        <div style="min-width:0;flex:1">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <span style="font-weight:600;font-size:13px">${esc(def.label)}</span>
            <span class="font-mono" style="font-size:11px">
              <b>${s.total}</b> ${t("camp.segTotal")} ·
              <span style="color:var(--ok)">${s.inWindow} ${t("camp.segInWindow")}</span> ·
              <span style="color:var(--warn)">${s.outWindow} ${t("camp.segOutWindow")}</span>
            </span>
          </div>
          <div class="text-dim" style="font-size:11.5px;margin-top:2px">${esc(def.desc)}</div>
        </div>
      </label>`;
    })
    .join("");

  const templateOpts =
    templates.length > 0
      ? templates
          .map(
            (tpl) =>
              `<option value="${esc(tpl.sid)}">${esc(tpl.name)} — “${esc(tpl.body.slice(0, 70))}${tpl.body.length > 70 ? "…" : ""}”</option>`,
          )
          .join("")
      : "";

  const templateSection =
    templates.length > 0
      ? `<select name="template_sid" style="width:100%;background:var(--panel);border:1px solid var(--line);color:inherit;padding:9px 10px;font-size:12px">
          <option value="">${t("camp.noTemplate")}</option>
          ${templateOpts}
        </select>
        <input name="template_vars" placeholder='${t("camp.templateVarsPlaceholder")}' class="font-mono"
          style="width:100%;margin-top:8px;background:var(--panel);border:1px solid var(--line);color:inherit;padding:8px 10px;font-size:11.5px">`
      : `<div class="text-dim" style="font-size:12px;border:1px dashed var(--line);padding:12px 14px">
          ${t("camp.noTemplates")}
        </div>`;

  const historyRows =
    history.length === 0
      ? `<tr><td colspan="4" class="text-dim" style="padding:14px;text-align:center;font-size:12px">${t("camp.noCampaigns")}</td></tr>`
      : history
          .map(
            (h) => `<tr style="border-top:1px solid var(--line)">
          <td style="padding:8px 12px;font-size:12px" class="font-mono">${esc(h.campaign_key)}</td>
          <td style="padding:8px 12px;font-size:12px;text-align:right">${h.freeform}</td>
          <td style="padding:8px 12px;font-size:12px;text-align:right">${h.template}</td>
          <td style="padding:8px 12px;font-size:11px;text-align:right" class="text-dim">${fmtAgo(t, h.last_at)}</td>
        </tr>`,
          )
          .join("");

  const body = `
  ${banner}

  <div style="display:grid;grid-template-columns:1fr;gap:18px;max-width:860px">

    <div style="border:1px solid var(--line);background:var(--panel2);padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
        <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase" class="text-dim">${t("camp.quotaTitle")}</div>
        <div class="font-mono" style="font-size:13px"><b>${spent}</b> / ${cap}</div>
      </div>
      <div style="height:8px;background:var(--raise);margin-top:8px;border:1px solid var(--line)">
        <div style="height:100%;width:${pct}%;background:${pct > 85 ? "var(--bad)" : "var(--accent)"}"></div>
      </div>
      <div class="text-dim" style="font-size:11px;margin-top:6px">
        ${t("camp.quotaNote")}
      </div>
    </div>

    <form method="post" action="/admin/campanas/send"
      onsubmit="return confirm('${t("camp.confirm")}')">

      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px" class="text-dim">${t("camp.step1")}</div>
      <div style="display:grid;gap:8px">${segRows}</div>

      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin:18px 0 8px" class="text-dim">${t("camp.step2")}</div>
      <textarea name="freeform_text" rows="3" placeholder="${t("camp.freeformPlaceholder")}"
        style="width:100%;background:var(--panel);border:1px solid var(--line);color:inherit;padding:10px 12px;font-size:12.5px"></textarea>

      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin:18px 0 8px" class="text-dim">${t("camp.step3")}</div>
      ${templateSection}

      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin:18px 0 8px" class="text-dim">${t("camp.step4")}</div>
      <input name="campaign_key" required placeholder="${t("camp.keyPlaceholder")}" class="font-mono"
        style="width:100%;background:var(--panel);border:1px solid var(--line);color:inherit;padding:9px 10px;font-size:12px">
      <div class="text-dim" style="font-size:11px;margin-top:4px">
        ${t("camp.keyHint")}
      </div>

      <button type="submit" class="btn" style="margin-top:16px;border:1px solid var(--accent);background:var(--warn-soft);padding:10px 22px;font-weight:700;font-size:12px;letter-spacing:.08em;cursor:pointer">
        ${t("camp.send")}
      </button>
      <span class="text-dim" style="font-size:11px;margin-left:10px">${t("camp.sendHint")}</span>
    </form>

    <div>
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px" class="text-dim">${t("camp.history")}</div>
      <table style="width:100%;border:1px solid var(--line);border-collapse:collapse;background:var(--panel)">
        <thead><tr class="text-dim" style="font-size:10px;letter-spacing:.14em;text-transform:uppercase">
          <th style="padding:8px 12px;text-align:left">${t("camp.thCampaign")}</th>
          <th style="padding:8px 12px;text-align:right">${t("camp.thFreeform")}</th>
          <th style="padding:8px 12px;text-align:right">${t("camp.thTemplates")}</th>
          <th style="padding:8px 12px;text-align:right">${t("camp.thLastSent")}</th>
        </tr></thead>
        <tbody>${historyRows}</tbody>
      </table>
    </div>
  </div>`;

  return layout({ title: t("camp.pageTitle"), activeTab: "campanas", body, env });
}
