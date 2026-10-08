import type { Env } from "../../env";
import { Db } from "../../db/client";
import { LeadsRepo, leadMetadata, LEAD_STATUSES, type Lead, type LeadStatus } from "../../db/leads";
import { ConversationLabelsRepo, NEEDS_HUMAN_LABEL, loadLabelCatalog, labelMetaIn, type LabelMeta } from "../../db/conversationLabels";
import { QuotesRepo, type Quote } from "../../db/quotes";
import { getNiche } from "../../niches";
import { layout } from "./layout";
import { fmtDate, fmtDateTime } from "../format";
import { panelI18n, type T } from "../i18n";

// Escapa texto del LLM/cliente antes de meterlo en HTML.
function esc(v: string | null | undefined): string {
  return (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const STATUS_COLOR: Record<LeadStatus, string> = {
  entrada: "var(--dim)",
  new: "var(--warn)",
  contacted: "var(--accent2)",
  sold: "var(--ok)",
  lost: "var(--bad)",
};

// ── Kanban (vista por defecto) ──────────────────────────────────────────────

const QUOTE_LABEL: Record<string, string> = {
  draft: "Cotización borrador",
  sent: "Cotización enviada",
  accepted: "Cotización aceptada",
  rejected: "Cotización rechazada",
  expired: "Cotización vencida",
};

function quoteChipLabel(q: Quote): string {
  const total = Math.round(q.total * 100) / 100;
  return `${QUOTE_LABEL[q.status] ?? "Cotización"} · $${total.toLocaleString("en-US")}`;
}

function kanbanCard(t: T, l: Lead, meta: Record<string, string>, niche: ReturnType<typeof getNiche>, labels: LabelMeta[] = [], quote?: Quote | null): string {
  const cols = niche.columns.length
    ? niche.columns.map((c) => meta[c.key]).filter(Boolean).slice(0, 3).join(" · ")
    : "";
  const resumen = l.status === "entrada" ? "" : l.intent;
  const moveOpts = LEAD_STATUSES.filter((s) => s !== l.status)
    .map((s) => `<option value="${s}">${esc(niche.statusLabels[s])}</option>`)
    .join("");
  const labelChips = labels
    .slice(0, 3)
    .map(
      (m) =>
        `<span style="font-size:9px;color:${esc(m.color)};border:1px solid ${esc(m.color)};padding:1px 6px;white-space:nowrap">${esc(m.name)}</span>`,
    )
    .join("");
  return `<div class="kb-card" draggable="true" data-lead-id="${l.id}"
    style="border:1px solid var(--line);background:var(--panel2);padding:10px 11px;display:flex;flex-direction:column;gap:5px;cursor:grab;font-size:12px">
    <div style="display:flex;justify-content:space-between;gap:6px">
      <span class="text-cream" style="font-weight:600">${esc(l.name) || t("lead.noName")}</span>
      <span class="text-dim" style="font-size:10px">${fmtDate(l.created_at)}</span>
    </div>
    ${l.contact ? `<div class="text-muted" style="font-size:11px">${esc(l.contact)}</div>` : ""}
    ${labelChips ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${labelChips}</div>` : ""}
    ${quote ? `<div><span style="font-size:9px;color:var(--accent);border:1px solid var(--accent);padding:1px 6px;white-space:nowrap">📄 ${esc(quoteChipLabel(quote))}</span></div>` : ""}
    ${cols ? `<div class="text-muted" style="font-size:11px">${esc(cols)}</div>` : ""}
    ${resumen ? `<div class="text-dim" style="font-size:11px;line-height:1.4;max-height:3.2em;overflow:hidden">${esc(resumen)}</div>` : ""}
    <div style="display:flex;gap:6px;align-items:center;margin-top:2px">
      ${l.conversation_id ? `<a href="/admin/conversations?c=${encodeURIComponent(l.conversation_id)}" class="text-accent" style="font-size:10.5px;text-decoration:none">${t("lead.viewChat")}</a>` : ""}
      <select class="kb-move" data-lead-id="${l.id}" aria-label="${t("lead.moveTo")}"
        style="margin-left:auto;background:var(--bg);border:1px solid var(--line);color:var(--muted);font-size:10.5px;padding:3px 5px">
        <option value="">${t("lead.move")}</option>${moveOpts}
      </select>
    </div>
  </div>`;
}

function kanbanJs(t: T): string {
  return `
(function(){
  var dragId = null;
  async function move(id, to){
    try{
      var body = new URLSearchParams({ status: to });
      var r = await fetch('/admin/leads/' + id + '/status', {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','x-kanban':'1'}, body: body.toString(), credentials:'include'
      });
      if(r.ok || r.status===204){
        var card = document.querySelector('[data-lead-id="'+id+'"].kb-card');
        var col = document.querySelector('.kb-col[data-status="'+to+'"] .kb-list');
        if(card && col){ col.appendChild(card); refreshCounts(); rebuildSelect(card, to); }
      }
    }catch(e){}
  }
  function refreshCounts(){
    document.querySelectorAll('.kb-col').forEach(function(c){
      var n = c.querySelectorAll('.kb-card').length;
      var b = c.querySelector('.kb-count'); if(b) b.textContent = String(n);
    });
  }
  function rebuildSelect(card, cur){
    var sel = card.querySelector('.kb-move'); if(!sel || !window.__kbLabels) return;
    sel.innerHTML = '<option value="">${t("lead.move")}</option>' + Object.keys(window.__kbLabels).filter(function(v){return v!==cur}).map(function(v){return '<option value="'+v+'">'+window.__kbLabels[v]+'</option>'}).join('');
  }
  document.addEventListener('dragstart', function(e){ var c=e.target.closest('.kb-card'); if(c){ dragId=c.getAttribute('data-lead-id'); c.style.opacity='.4'; }});
  document.addEventListener('dragend', function(e){ var c=e.target.closest('.kb-card'); if(c) c.style.opacity=''; });
  document.querySelectorAll('.kb-col').forEach(function(col){
    col.addEventListener('dragover', function(e){ e.preventDefault(); col.style.background='var(--raise)'; });
    col.addEventListener('dragleave', function(){ col.style.background=''; });
    col.addEventListener('drop', function(e){ e.preventDefault(); col.style.background=''; if(dragId) move(dragId, col.getAttribute('data-status')); dragId=null; });
  });
  document.addEventListener('change', function(e){
    var sel = e.target.closest('.kb-move');
    if(sel && sel.value){ move(sel.getAttribute('data-lead-id'), sel.value); sel.value=''; }
  });
})();
`;
}

function renderKanban(t: T, env: Env, list: Lead[], niche: ReturnType<typeof getNiche>, labelMap: Record<string, string[]> = {}, catalog: Record<string, LabelMeta> = {}, quoteMap: Record<string, Quote> = {}): string {
  const labels = JSON.stringify(Object.fromEntries(LEAD_STATUSES.map((v) => [v, niche.statusLabels[v]])));
  const columns = LEAD_STATUSES.map((s) => {
    const items = list.filter((l) => l.status === s);
    const cards = items
      .map((l) => {
        const assigned = l.conversation_id ? labelMap[l.conversation_id] ?? [] : [];
        const metas = assigned.map((id) => labelMetaIn(catalog, id));
        const quote = l.conversation_id ? quoteMap[l.conversation_id] : null;
        return kanbanCard(t, l, leadMetadata(l), niche, metas, quote);
      })
      .join("");
    return `<div class="kb-col" data-status="${s}" style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px;border:1px solid var(--line);background:var(--panel);padding:10px">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="width:8px;height:8px;background:${STATUS_COLOR[s]};flex:none"></span>
        <span class="text-cream" style="font-size:12px;font-weight:600">${esc(niche.statusLabels[s])}</span>
        <span class="kb-count text-dim" style="font-size:11px;margin-left:auto">${items.length}</span>
      </div>
      <div class="kb-list" style="display:flex;flex-direction:column;gap:8px;min-height:40px">${cards}</div>
    </div>`;
  }).join("");

  return `<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:6px">${columns}</div>
    <script>window.__kbLabels=${labels};</script><script>${kanbanJs(t)}</script>`;
}

// ── Tabla (?vista=tabla) ────────────────────────────────────────────────────

function renderTabla(t: T, env: Env, list: Lead[], niche: ReturnType<typeof getNiche>, humanSet: Set<string> = new Set()): string {
  const statusLabel = (s: LeadStatus) => niche.statusLabels[s];
  const rows = list
    .map((l) => {
      const meta = leadMetadata(l);
      const human = !!l.conversation_id && humanSet.has(l.conversation_id);
      const nicheCells = niche.columns.length
        ? niche.columns.map((c) => `<td class="text-muted" style="padding:8px 10px">${esc(meta[c.key]) || "—"}</td>`).join("")
        : `<td class="text-muted" style="padding:8px 10px">${esc(l.status === "entrada" ? "—" : l.intent)}</td>`;
      return `<tr style="border-top:1px solid var(--line)">
        <td class="text-dim" style="padding:8px 10px;font-size:11px">${fmtDate(l.created_at)}</td>
        <td class="text-cream" style="padding:8px 10px">${esc(l.name) || t("lead.noName")}${human ? ` <span style="font-size:9px;color:var(--bad);border:1px solid var(--bad);padding:0 5px">⚑</span>` : ""}</td>
        <td class="text-muted" style="padding:8px 10px">${esc(l.contact) || "—"}</td>
        ${nicheCells}
        <td style="padding:8px 10px">
          <form method="POST" action="/admin/leads/${l.id}/status">
            <input type="hidden" name="vista" value="tabla">
            <select name="status" onchange="this.form.submit()" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:5px 7px;font-size:11px">
              ${LEAD_STATUSES.map((s) => `<option ${l.status === s ? "selected" : ""} value="${s}">${esc(statusLabel(s))}</option>`).join("")}
            </select>
          </form>
        </td>
        <td style="padding:8px 10px">${l.conversation_id ? `<a href="/admin/conversations?c=${encodeURIComponent(l.conversation_id)}" class="text-accent" style="font-size:11px;text-decoration:none">${t("lead.viewChat")}</a>` : ""}</td>
      </tr>`;
    })
    .join("");
  const headExtra = niche.columns.length ? niche.columns.map((c) => `<th style="padding:8px 10px;text-align:left">${esc(c.label)}</th>`).join("") : `<th style="padding:8px 10px;text-align:left">${t("lead.colSummary")}</th>`;
  return `<div class="bg-panel border border-line" style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px">
      <thead><tr style="font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)">
        <th style="padding:8px 10px;text-align:left">${t("lead.colDate")}</th><th style="padding:8px 10px;text-align:left">${t("lead.colName")}</th><th style="padding:8px 10px;text-align:left">${t("lead.colContact")}</th>
        ${headExtra}<th style="padding:8px 10px;text-align:left">${t("lead.colStatus")}</th><th></th>
      </tr></thead>
      <tbody>${list.length ? rows : `<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--dim)">${t("lead.empty", { n: esc(niche.recordPlural.toLowerCase()) })}</td></tr>`}</tbody>
    </table>
  </div>`;
}

export async function renderLeads(env: Env, vista: "kanban" | "tabla" = "kanban"): Promise<string> {
  const { t } = await panelI18n(env);
  const niche = getNiche(env);
  const db = new Db(env.DB);
  const list = await new LeadsRepo(db).list(300);

  // Conversaciones que necesitan atención humana (etiqueta) → badge en el kanban.
  const labelMap = await new ConversationLabelsRepo(db)
    .byConversationIds(list.map((l) => l.conversation_id ?? "").filter(Boolean))
    .catch(() => ({}) as Record<string, string[]>);
  const catalog = await loadLabelCatalog(env).catch(() => ({}));
  const quoteMap = await new QuotesRepo(db)
    .latestByConversations(list.map((l) => l.conversation_id ?? "").filter(Boolean))
    .catch(() => ({}) as Record<string, Quote>);
  const humanSet = new Set(
    Object.entries(labelMap)
      .filter(([, ls]) => ls.includes(NEEDS_HUMAN_LABEL))
      .map(([id]) => id),
  );

  const tab = (v: "kanban" | "tabla", label: string) =>
    `<a href="/admin/leads${v === "tabla" ? "?vista=tabla" : ""}" style="font-size:12px;padding:6px 12px;border:1px solid ${vista === v ? "var(--accent)" : "var(--line)"};color:${vista === v ? "var(--accent)" : "var(--muted)"};text-decoration:none">${label}</a>`;

  const body = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:10px;flex-wrap:wrap">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${esc(niche.recordPlural)}</h2>
        <p class="text-muted text-[12px]">${t("lead.subtitleBefore")}<b class="text-cream">${esc(niche.statusLabels.entrada)}</b>${t("lead.subtitleAfter")}</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${tab("kanban", t("lead.tabKanban"))} ${tab("tabla", t("lead.tabTabla"))}
        <a href="/admin/leads/export.csv" style="font-size:12px;padding:6px 12px;border:1px solid var(--line);color:var(--muted);text-decoration:none">${t("lead.exportCsv")}</a>
      </div>
    </div>
    ${vista === "kanban" ? renderKanban(t, env, list, niche, labelMap, catalog, quoteMap) : renderTabla(t, env, list, niche, humanSet)}`;

  return layout({ title: niche.recordPlural, activeTab: "leads", body, env });
}

export async function exportLeadsCsv(env: Env): Promise<string> {
  const leads = new LeadsRepo(new Db(env.DB));
  const list = await leads.list(10_000);
  const header = "fecha,nombre,contacto,intent,status,notas,metadata\n";
  const rows = list
    .map((l) => {
      const date = new Date(l.created_at).toISOString();
      const q = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
      return `${date},${q(l.name)},${q(l.contact)},${q(l.intent)},${l.status},${q(l.notes)},${q(l.metadata)}`;
    })
    .join("\n");
  return header + rows;
}
