// Vista "Etiquetas" — CRUD del catálogo de etiquetas del usuario y de las reglas
// que las aplican solas (palabra clave o IA). Las etiquetas se asignan a las
// conversaciones desde la bandeja (chips) y el bot las pone con la tool
// etiquetarConversacion o el análisis nocturno.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { LabelsRepo, type LabelRow, type LabelRule } from "../../db/labels";
import { SettingsRepo, SETTING_KEYS } from "../../db/settings";
import { layout } from "./layout";
import { panelI18n, type T } from "../i18n";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

const inputStyle = "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px";
const btn = (color: string) =>
  `background:transparent;border:1px solid ${color};color:${color};padding:5px 10px;font-size:11.5px;cursor:pointer`;

function ruleRow(t: T, rule: LabelRule): string {
  const isKeyword = rule.kind === "keyword";
  let kws: string[] = [];
  try {
    kws = JSON.parse(rule.keywords ?? "[]");
  } catch { /* ignore */ }
  const desc = isKeyword ? `Palabras: ${kws.join(", ") || "—"}` : `IA: ${rule.ai_instruction ?? "—"}`;
  return `<div style="display:flex;align-items:center;gap:8px;border:1px dashed var(--line);padding:6px 9px;font-size:11.5px">
    <span style="color:${isKeyword ? "var(--info)" : "var(--accent-2)"};border:1px solid currentColor;padding:0 6px">${isKeyword ? "keyword" : "IA"}</span>
    <span class="text-muted" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(desc)}</span>
    <span style="color:${rule.enabled ? "var(--ok)" : "var(--dim)"}">${rule.enabled ? "on" : "off"}</span>
    <form method="POST" action="/admin/etiquetas/rules/${rule.id}/delete" style="display:inline">
      <button type="submit" style="${btn("var(--bad)")}">${t("lab.ruleDelete")}</button>
    </form>
  </div>`;
}

function labelRow(t: T, l: LabelRow, rules: LabelRule[]): string {
  const color = l.color || "var(--muted)";
  const off = l.enabled === 0;
  return `<div class="bg-panel border border-line" style="padding:12px 14px;display:flex;flex-direction:column;gap:9px;${off ? "opacity:.6" : ""}">
    <form method="POST" action="/admin/etiquetas/${encodeURIComponent(l.id)}/save" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <span style="width:10px;height:10px;background:${esc(color)};border:1px solid var(--linelit)"></span>
      <input name="name" value="${esc(l.name)}" required style="${inputStyle};min-width:160px">
      <input name="color" value="${esc(color)}" title="Color CSS" style="${inputStyle};width:130px">
      <input name="icon" value="${esc(l.icon ?? "")}" placeholder="${esc(t("lab.iconPh"))}" style="${inputStyle};width:130px">
      <input name="description" value="${esc(l.description ?? "")}" placeholder="${esc(t("lab.descPh"))}" style="${inputStyle};flex:1;min-width:180px">
      <span class="text-dim" style="font-size:10px">${t("lab.id")} ${esc(l.id)}</span>
      <button type="submit" style="${btn("var(--accent)")}">${t("lab.save")}</button>
    </form>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
      <form method="POST" action="/admin/etiquetas/${encodeURIComponent(l.id)}/toggle" style="display:inline">
        <button type="submit" style="${btn(off ? "var(--ok)" : "var(--warn)")}">${off ? t("lab.activate") : t("lab.deactivate")}</button>
      </form>
      <form method="POST" action="/admin/etiquetas/${encodeURIComponent(l.id)}/delete" style="display:inline">
        <button type="submit" style="${btn("var(--bad)")}">${t("lab.delete")}</button>
      </form>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rules.length ? rules.map((r) => ruleRow(t, r)).join("") : `<span class="text-dim" style="font-size:11.5px">${t("lab.noRules")}</span>`}
      <form method="POST" action="/admin/etiquetas/${encodeURIComponent(l.id)}/rules/save" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:2px">
        <select name="kind" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:11.5px">
          <option value="keyword">${t("lab.ruleKeyword")}</option>
          <option value="ai">${t("lab.ruleAi")}</option>
        </select>
        <input name="keywords" placeholder="${esc(t("lab.kwPh"))}" style="${inputStyle};flex:1;min-width:170px">
        <input name="instruction" placeholder="${esc(t("lab.insPh"))}" style="${inputStyle};flex:1;min-width:170px">
        <button type="submit" style="${btn("var(--accent-2)")}">${t("lab.addRule")}</button>
      </form>
    </div>
  </div>`;
}

export async function renderEtiquetas(env: Env, saved = false): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const repo = new LabelsRepo(db);
  const labels = await repo.list().catch(() => [] as LabelRow[]);
  const rules = await repo.listRules().catch(() => [] as LabelRule[]);
  const rulesByLabel = new Map<string, LabelRule[]>();
  for (const r of rules) {
    if (!rulesByLabel.has(r.label_id)) rulesByLabel.set(r.label_id, []);
    rulesByLabel.get(r.label_id)!.push(r);
  }

  const captureAutoLabel = (await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.captureAutoLabel).catch(() => null)) ?? "";

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("lab.title")}</h2>
        <p class="text-muted text-[12.5px]">${t("lab.subtitle")}</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">${t("lab.saved")}</div>` : ""}

      <form method="POST" action="/admin/etiquetas/save" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span class="font-display font-semibold text-[13px] text-cream">${t("lab.new")}</span>
        <input name="name" placeholder="${esc(t("lab.namePh"))}" required style="${inputStyle};min-width:200px">
        <input name="color" placeholder="${esc(t("lab.colorPh"))}" style="${inputStyle};width:160px">
        <input name="icon" placeholder="${esc(t("lab.iconPh"))}" style="${inputStyle};width:150px">
        <input name="description" placeholder="${esc(t("lab.descPh"))}" style="${inputStyle};flex:1;min-width:160px">
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer">${t("lab.create")}</button>
      </form>

      <form method="POST" action="/admin/etiquetas/capture-label" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <span class="font-display font-semibold text-[13px] text-cream">${t("lab.captureTitle")}</span>
        <span class="text-muted" style="font-size:12px">${t("lab.captureApply")}</span>
        <select name="label" style="${inputStyle};min-width:200px">
          <option value="">${t("lab.captureNone")}</option>
          ${labels.map((l) => `<option value="${esc(l.id)}" ${captureAutoLabel === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}
        </select>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer">${t("lab.save")}</button>
      </form>

      ${labels.length ? labels.map((l) => labelRow(t, l, rulesByLabel.get(l.id) ?? [])).join("") : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">${t("lab.empty")}</div>`}
    </div>`;

  return layout({ title: t("nav.etiquetas"), activeTab: "etiquetas", body, env });
}
