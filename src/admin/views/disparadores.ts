// Vista "Disparadores" — automatizaciones keyword→flujo multi-canal. Cada
// disparador se evalúa en cada mensaje entrante (todos los canales): por palabra
// clave, por IA o siempre; y dispara una acción (responder fijo, responder con
// IA, etiquetar, capturar lead, derivar a humano o una secuencia de mensajes).
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { TriggersRepo, TRIGGER_ACTIONS, type Trigger, type TriggerAction } from "../../db/triggers";
import { layout } from "./layout";
import { panelI18n } from "../i18n";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const inputStyle = "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px";
const ACTIONS: Record<TriggerAction, string> = {
  reply_fixed: "Responder (texto fijo)",
  reply_ai: "Responder con IA",
  label: "Etiquetar la conversación",
  capture_lead: "Capturar lead",
  handoff: "Pasar a un humano",
  flow: "Secuencia de mensajes",
};

function triggerRow(tr: Trigger, steps: { delay_minutes: number; kind: string; content: string | null }[]): string {
  const kws = TriggersRepo.keywordsOf(tr);
  const payload = TriggersRepo.parsePayload(tr);
  const matchDesc =
    tr.match_kind === "any" ? "Siempre" : tr.match_kind === "keyword" ? `Palabras: ${kws.join(", ") || "—"}` : `IA: ${tr.ai_instruction ?? "—"}`;
  const stepsText = steps.map((s) => `${s.delay_minutes}|${s.content ?? ""}`).join("\n");
  return `<div class="bg-panel border border-line" style="padding:12px 14px;display:flex;flex-direction:column;gap:9px;${tr.enabled === 0 ? "opacity:.6" : ""}">
    <form method="POST" action="/admin/disparadores/${encodeURIComponent(tr.id)}/save" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 90px;gap:8px;align-items:center">
        <input name="name" value="${esc(tr.name)}" required placeholder="Nombre" style="${inputStyle}">
        <select name="match_kind" style="${inputStyle}">
          <option value="keyword" ${tr.match_kind === "keyword" ? "selected" : ""}>Por palabra clave</option>
          <option value="ai" ${tr.match_kind === "ai" ? "selected" : ""}>Por IA</option>
          <option value="any" ${tr.match_kind === "any" ? "selected" : ""}>Siempre</option>
        </select>
        <select name="action" style="${inputStyle}">
          ${TRIGGER_ACTIONS.map((a) => `<option value="${a}" ${tr.action === a ? "selected" : ""}>${ACTIONS[a]}</option>`).join("")}
        </select>
        <input name="priority" type="number" value="${tr.priority}" title="Prioridad" style="${inputStyle}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 150px;gap:8px">
        <input name="keywords" value="${esc(kws.join(", "))}" placeholder="Palabras clave (coma)" style="${inputStyle}">
        <input name="ai_instruction" value="${esc(tr.ai_instruction ?? "")}" placeholder="Condición para la IA" style="${inputStyle}">
        <input name="scope" value="${esc(tr.scope ?? "any")}" placeholder="canal (any)" title="Limitar a un canal (telegram, whatsapp…). 'any' = todos." style="${inputStyle}">
      </div>
      <input name="payload" value="${esc(String(payload.message ?? payload.instruction ?? payload.label ?? payload.intent ?? payload.reason ?? ""))}" placeholder="Texto / instrucción / etiqueta / motivo según la acción" style="${inputStyle}">
      <textarea name="steps" rows="3" placeholder="Secuencia (una línea por paso: minutos|contenido · prefijo ai: para redactar con IA)" style="${inputStyle}">${esc(stepsText)}</textarea>
      <div style="display:flex;gap:8px;align-items:center">
        <label style="font-size:11px;color:var(--muted);display:inline-flex;gap:6px;align-items:center"><input type="checkbox" name="run_once" ${tr.run_once_per_conversation === 1 ? "checked" : ""}> Solo una vez por conversación</label>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer">Guardar</button>
        <span class="text-dim" style="font-size:10.5px">${esc(matchDesc)}</span>
      </div>
    </form>
    <div style="display:flex;gap:6px">
      <form method="POST" action="/admin/disparadores/${encodeURIComponent(tr.id)}/toggle" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid ${tr.enabled ? "var(--warn)" : "var(--ok)"};color:${tr.enabled ? "var(--warn)" : "var(--ok)"};padding:5px 10px;font-size:11.5px;cursor:pointer">${tr.enabled ? "Desactivar" : "Activar"}</button>
      </form>
      <form method="POST" action="/admin/disparadores/${encodeURIComponent(tr.id)}/delete" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:5px 10px;font-size:11.5px;cursor:pointer">Eliminar</button>
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
        <h2 class="font-display font-semibold text-[15px] text-cream">Disparadores</h2>
        <p class="text-muted text-[12.5px]">Cuando el cliente dice cierta palabra —o la IA detecta una intención— se dispara una acción, en todos los canales. Se evalúa antes de que el bot piense; si el disparador responde, el agente no vuelve a responder.</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">Guardado.</div>` : ""}

      <form method="POST" action="/admin/disparadores/save" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">Nuevo disparador</span>
        <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:8px">
          <input name="name" placeholder="Nombre (ej. Precio)" required style="${inputStyle}">
          <select name="match_kind" style="${inputStyle}">
            <option value="keyword">Por palabra clave</option>
            <option value="ai">Por IA</option>
            <option value="any">Siempre</option>
          </select>
          <select name="action" style="${inputStyle}">
            ${TRIGGER_ACTIONS.map((a) => `<option value="${a}">${ACTIONS[a]}</option>`).join("")}
          </select>
        </div>
        <input name="keywords" placeholder="Palabras clave (coma)" style="${inputStyle}">
        <input name="ai_instruction" placeholder="Condición para la IA (ej. el cliente pregunta el precio)" style="${inputStyle}">
        <input name="scope" placeholder="canal (any)" title="Limitar a un canal; 'any' = todos" style="${inputStyle}">
        <input name="payload" placeholder="Texto / instrucción / etiqueta / motivo" style="${inputStyle}">
        <textarea name="steps" rows="2" placeholder="Secuencia (una línea por paso: minutos|contenido · prefijo ai: para IA)" style="${inputStyle}"></textarea>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;align-self:start">Crear</button>
      </form>

      ${triggers.length ? triggers.map((tr) => triggerRow(tr, stepMap.get(tr.id) ?? [])).join("") : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">Todavía no hay disparadores.</div>`}
    </div>`;

  return layout({ title: t("nav.disparadores"), activeTab: "disparadores", body, env });
}
