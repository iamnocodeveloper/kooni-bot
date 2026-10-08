// Vista "Disparadores" — automatizaciones keyword→flujo multi-canal. Cada
// disparador se evalúa en cada mensaje entrante (todos los canales): por palabra
// clave, por IA o siempre; y dispara una acción (responder fijo, responder con
// IA, etiquetar, capturar lead, derivar a humano o una secuencia de mensajes).
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { TriggersRepo, TRIGGER_ACTIONS, type Trigger, type TriggerAction } from "../../db/triggers";
import { layout } from "./layout";
import { panelI18n, type T } from "../i18n";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const inputStyle = "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px";

function actionLabel(t: T, a: TriggerAction): string {
  return t((`trg.action.${a}`) as never);
}

function triggerRow(t: T, tr: Trigger, steps: { delay_minutes: number; kind: string; content: string | null }[]): string {
  const kws = TriggersRepo.keywordsOf(tr);
  const payload = TriggersRepo.parsePayload(tr);
  const matchDesc =
    tr.match_kind === "any"
      ? t("trg.kindAny")
      : tr.match_kind === "keyword"
        ? `${t("trg.keywordsPh")}: ${kws.join(", ") || "—"}`
        : `IA: ${tr.ai_instruction ?? "—"}`;
  const stepsText = steps.map((s) => `${s.delay_minutes}|${s.content ?? ""}`).join("\n");
  return `<div class="bg-panel border border-line" style="padding:12px 14px;display:flex;flex-direction:column;gap:9px;${tr.enabled === 0 ? "opacity:.6" : ""}">
    <form method="POST" action="/admin/disparadores/${encodeURIComponent(tr.id)}/save" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 90px;gap:8px;align-items:center">
        <input name="name" value="${esc(tr.name)}" required placeholder="${esc(t("trg.namePh"))}" style="${inputStyle}">
        <select name="match_kind" style="${inputStyle}">
          <option value="keyword" ${tr.match_kind === "keyword" ? "selected" : ""}>${t("trg.kindKeyword")}</option>
          <option value="ai" ${tr.match_kind === "ai" ? "selected" : ""}>${t("trg.kindAi")}</option>
          <option value="any" ${tr.match_kind === "any" ? "selected" : ""}>${t("trg.kindAny")}</option>
        </select>
        <select name="action" style="${inputStyle}">
          ${TRIGGER_ACTIONS.map((a) => `<option value="${a}" ${tr.action === a ? "selected" : ""}>${actionLabel(t, a)}</option>`).join("")}
        </select>
        <input name="priority" type="number" value="${tr.priority}" title="${esc(t("trg.priority"))}" style="${inputStyle}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 150px;gap:8px">
        <input name="keywords" value="${esc(kws.join(", "))}" placeholder="${esc(t("trg.keywordsPh"))}" style="${inputStyle}">
        <input name="ai_instruction" value="${esc(tr.ai_instruction ?? "")}" placeholder="${esc(t("trg.aiPh"))}" style="${inputStyle}">
        <input name="scope" value="${esc(tr.scope ?? "any")}" placeholder="${esc(t("trg.scopePh"))}" title="${esc(t("trg.scopePh"))}" style="${inputStyle}">
      </div>
      <input name="payload" value="${esc(String(payload.message ?? payload.instruction ?? payload.label ?? payload.intent ?? payload.reason ?? ""))}" placeholder="${esc(t("trg.payloadPh"))}" style="${inputStyle}">
      <textarea name="steps" rows="3" placeholder="${esc(t("trg.stepsPh"))}" style="${inputStyle}">${esc(stepsText)}</textarea>
      <div style="display:flex;gap:8px;align-items:center">
        <label style="font-size:11px;color:var(--muted);display:inline-flex;gap:6px;align-items:center"><input type="checkbox" name="run_once" ${tr.run_once_per_conversation === 1 ? "checked" : ""}> ${t("trg.runOnce")}</label>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer">${t("trg.save")}</button>
        <span class="text-dim" style="font-size:10.5px">${esc(matchDesc)}</span>
      </div>
    </form>
    <div style="display:flex;gap:6px">
      <form method="POST" action="/admin/disparadores/${encodeURIComponent(tr.id)}/toggle" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid ${tr.enabled ? "var(--warn)" : "var(--ok)"};color:${tr.enabled ? "var(--warn)" : "var(--ok)"};padding:5px 10px;font-size:11.5px;cursor:pointer">${tr.enabled ? t("trg.deactivate") : t("trg.activate")}</button>
      </form>
      <form method="POST" action="/admin/disparadores/${encodeURIComponent(tr.id)}/delete" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:5px 10px;font-size:11.5px;cursor:pointer">${t("trg.delete")}</button>
      </form>
    </div>
  </div>`;
}

export async function renderDisparadores(env: Env, saved = false): Promise<string> {
  const { t } = await panelI18n(env);
  const repo = new TriggersRepo(new Db(env.DB));
  const triggers = await repo.list().catch(() => [] as Trigger[]);
  const stepMap = new Map<string, { delay_minutes: number; kind: string; content: string | null }[]>();
  for (const tr of triggers) stepMap.set(tr.id, await repo.steps(tr.id).catch(() => []));

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("trg.title")}</h2>
        <p class="text-muted text-[12.5px]">${t("trg.subtitle")}</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">${t("trg.saved")}</div>` : ""}

      <form method="POST" action="/admin/disparadores/save" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">${t("trg.new")}</span>
        <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:8px">
          <input name="name" placeholder="${esc(t("trg.namePh"))}" required style="${inputStyle}">
          <select name="match_kind" style="${inputStyle}">
            <option value="keyword">${t("trg.kindKeyword")}</option>
            <option value="ai">${t("trg.kindAi")}</option>
            <option value="any">${t("trg.kindAny")}</option>
          </select>
          <select name="action" style="${inputStyle}">
            ${TRIGGER_ACTIONS.map((a) => `<option value="${a}">${actionLabel(t, a)}</option>`).join("")}
          </select>
        </div>
        <input name="keywords" placeholder="${esc(t("trg.keywordsPh"))}" style="${inputStyle}">
        <input name="ai_instruction" placeholder="${esc(t("trg.aiPh"))}" style="${inputStyle}">
        <input name="scope" placeholder="${esc(t("trg.scopePh"))}" style="${inputStyle}">
        <input name="payload" placeholder="${esc(t("trg.payloadPh"))}" style="${inputStyle}">
        <textarea name="steps" rows="2" placeholder="${esc(t("trg.stepsPh"))}" style="${inputStyle}"></textarea>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;align-self:start">${t("trg.create")}</button>
      </form>

      ${triggers.length ? triggers.map((tr) => triggerRow(t, tr, stepMap.get(tr.id) ?? [])).join("") : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">${t("trg.empty")}</div>`}
    </div>`;

  return layout({ title: t("nav.disparadores"), activeTab: "disparadores", body, env });
}
