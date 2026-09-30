import type { Env } from "../../env";
import { Db } from "../../db/client";
import { CollectionsRepo, daysOverdue, type DebtorRow } from "../../db/collections";
import { layout } from "./layout";
import { panelI18n, type T, type MessageKey } from "../i18n";
import { fmtDate, fmtDateTime } from "../format";

function esc(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Etapa de cobranza → clave i18n (mismo orden que el flujo del motor). */
const STAGE_KEY: Record<string, MessageKey> = {
  nuevo: "car.stage.nuevo",
  recordatorio: "car.stage.recordatorio",
  negociacion: "car.stage.negociacion",
  promesa: "car.stage.promesa",
  escalado: "car.stage.escalado",
  pagado: "car.stage.pagado",
  incobrable: "car.stage.incobrable",
};
const STAGE_COLOR: Record<string, string> = {
  nuevo: "var(--dim)",
  recordatorio: "var(--info)",
  negociacion: "var(--accent)",
  promesa: "var(--warn)",
  escalado: "var(--bad)",
  pagado: "var(--ok)",
  incobrable: "var(--bad)",
};

function kpi(label: string, value: string, color = "var(--cream)") {
  return `<div class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:4px">
    <span class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;text-transform:uppercase">${esc(label)}</span>
    <span class="font-display font-semibold text-[20px]" style="color:${color}">${esc(value)}</span>
  </div>`;
}

/** Nombre visible de una etapa; si la etapa es desconocida se muestra tal cual. */
function stageLabel(t: T, stage: string | null | undefined): string {
  const s = stage ?? "nuevo";
  const key = STAGE_KEY[s];
  return key ? t(key) : s;
}

function stagePill(t: T, stage: string | null): string {
  const s = stage ?? "nuevo";
  const c = STAGE_COLOR[s] ?? "var(--muted)";
  return `<span class="text-[10px]" style="color:${c};border:1px solid ${c};padding:1px 6px;white-space:nowrap">${esc(stageLabel(t, s))}</span>`;
}

function debtorRow(t: T, d: DebtorRow): string {
  const mora = daysOverdue(d.next_due);
  return `<tr style="border-top:1px solid var(--line)">
    <td style="padding:8px 10px"><a href="/admin/cartera?d=${encodeURIComponent(d.id)}" class="text-accent" style="text-decoration:none">${esc(d.name) || t("car.noName")}</a></td>
    <td class="text-muted" style="padding:8px 10px;font-size:11px">${esc(d.phone) || "—"}</td>
    <td class="text-cream" style="padding:8px 10px;font-family:'Sora';font-weight:600">${money(d.balance)}</td>
    <td class="text-muted" style="padding:8px 10px;font-size:11px">${d.next_due ? fmtDate(d.next_due) : "—"}</td>
    <td style="padding:8px 10px">${mora > 0 ? `<span class="text-[10px]" style="color:var(--bad)">${mora} d</span>` : `<span class="text-dim text-[10px]">${t("car.upToDate")}</span>`}</td>
    <td style="padding:8px 10px">${stagePill(t, d.stage)}</td>
  </tr>`;
}

async function renderDetail(t: T, repo: CollectionsRepo, id: string): Promise<string> {
  const d = await repo.getDebtor(id);
  if (!d) return `<div class="bg-panel border border-line" style="padding:24px"><p class="text-dim text-[12.5px]">${t("car.debtorNotFound")}</p></div>`;
  const accounts = await repo.listAccounts(id);
  const inter = await repo.listInteractions(id, 20);
  const promises = await repo.listPromises(id);

  const accRows = accounts
    .map(
      (a) => `<tr style="border-top:1px solid var(--line)">
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${esc(a.concept) || t("car.debtFallback")}</td>
        <td class="text-cream" style="padding:7px 10px;font-size:11.5px">${money(a.amount)}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${money(a.amount - a.paid)}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${a.due_date ? fmtDate(a.due_date) : "—"}</td>
        <td style="padding:7px 10px"><span class="text-[10px] text-dim">${esc(a.status)}</span></td>
        <td style="padding:7px 10px">
          <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/payment" style="display:flex;gap:6px">
            <input type="hidden" name="account_id" value="${esc(a.id)}">
            <input name="amount" type="number" step="0.01" min="0" placeholder="${t("car.amount")}" style="width:90px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:5px 7px;font-size:11px">
            <button class="text-[10.5px] cursor-pointer" style="border:1px solid var(--ok);color:var(--ok);background:none;padding:5px 9px">${t("car.pay")}</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");

  const promRows = promises
    .map(
      (p) => `<div style="display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--line)" class="text-[11.5px]">
        <span class="text-cream">${money(p.amount)}</span>
        <span class="text-muted">${p.promised_date ? fmtDate(p.promised_date) : t("car.noDate")}</span>
        <span class="text-dim" style="margin-left:auto">${esc(p.status)}</span>
      </div>`,
    )
    .join("");

  const interRows = inter
    .map(
      (i) => `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--line)" class="text-[11.5px]">
        <span class="text-dim" style="width:120px;flex:none">${fmtDateTime(i.created_at)}</span>
        <span class="text-muted" style="width:90px;flex:none">${esc(i.channel)}/${esc(i.kind)}</span>
        <span class="text-muted" style="flex:1">${esc((i.summary ?? "").slice(0, 160)) || "—"}</span>
        <span class="text-dim" style="flex:none">${esc(i.outcome ?? "")}</span>
      </div>`,
    )
    .join("");

  const stage = d.stage ?? "nuevo";
  const stageOpts = Object.keys(STAGE_KEY)
    .map((s) => `<option value="${s}" ${s === stage ? "selected" : ""}>${stageLabel(t, s)}</option>`)
    .join("");

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div class="bg-panel border border-line" style="padding:16px 18px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <a href="/admin/cartera" class="text-dim" style="text-decoration:none;font-size:12px">← ${t("car.title")}</a>
        <span class="font-display font-semibold text-[15px] text-cream">${esc(d.name) || t("car.noName")}</span>
        ${stagePill(t, stage)}
        ${d.phone ? `<a href="https://wa.me/${esc((d.phone || "").replace(/\D/g, ""))}" target="_blank" rel="noopener" class="text-accent" style="font-size:11.5px">${esc(d.phone)}</a>` : ""}
        ${d.document_id ? `<span class="text-dim text-[11px]">${t("car.doc")} ${esc(d.document_id)}</span>` : ""}
        <span class="text-cream" style="margin-left:auto;font-family:'Sora';font-weight:600">${t("car.balance")} ${money(d.balance)}</span>
      </div>
      <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/stage" style="display:flex;gap:8px;margin-top:12px;align-items:center">
        <span class="text-dim text-[11px]">${t("car.stage")}</span>
        <select name="stage" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 9px;font-size:11.5px">${stageOpts}</select>
        <button class="text-[11px] cursor-pointer" style="border:1px solid var(--accent);color:var(--accent);background:none;padding:6px 12px">${t("common.save")}</button>
        <input name="note" placeholder="${t("car.noteOptional")}" style="flex:1;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 9px;font-size:11.5px">
      </form>
      <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/call" style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="text-[11.5px] cursor-pointer" style="border:1px solid var(--accent);color:var(--accent);background:none;padding:7px 13px">${t("car.callAI")}</button>
        <span class="text-dim text-[10.5px]">${t("car.callAIHint")}</span>
      </form>
      <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/dnc" style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <input type="hidden" name="on" value="${d.dnc && Number(d.dnc) > 0 ? "0" : "1"}">
        <button class="text-[11.5px] cursor-pointer" style="border:1px solid ${d.dnc && Number(d.dnc) > 0 ? "var(--ok)" : "var(--bad)"};color:${d.dnc && Number(d.dnc) > 0 ? "var(--ok)" : "var(--bad)"};background:none;padding:7px 13px">${d.dnc && Number(d.dnc) > 0 ? t("car.dncOn") : t("car.dncOff")}</button>
        ${d.dnc && Number(d.dnc) > 0 ? `<span class="text-[10.5px]" style="color:var(--bad)">${t("car.dncHint")}</span>` : ""}
      </form>
    </div>

    <div class="bg-panel border border-line" style="padding:16px 18px">
      <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;margin-bottom:8px">${t("car.debtTitle")}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr class="text-dim text-[10px]" style="text-align:left"><th style="padding:6px 10px">${t("car.colConcept")}</th><th style="padding:6px 10px">${t("car.colAmount")}</th><th style="padding:6px 10px">${t("car.colBalance")}</th><th style="padding:6px 10px">${t("car.colDue")}</th><th style="padding:6px 10px">${t("car.colStatus")}</th><th></th></tr></thead>
        <tbody>${accRows || `<tr><td colspan="6" class="text-dim" style="padding:14px">${t("car.noDebts")}</td></tr>`}</tbody>
      </table>
      <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/account" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <input name="amount" type="number" step="0.01" min="0" placeholder="${t("car.amount")}" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px">
        <input name="concept" placeholder="${t("car.concept")}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px">
        <input name="due_date" type="date" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px">
        <button class="text-[11px] cursor-pointer" style="border:1px solid var(--line);color:var(--cream);background:none;padding:7px 12px">${t("car.addDebt")}</button>
      </form>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="bg-panel border border-line" style="padding:16px 18px">
        <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;margin-bottom:8px">${t("car.promisesTitle")}</div>
        ${promRows || `<div class="text-dim text-[11.5px]">${t("car.noPromises")}</div>`}
        <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/promise" style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <input name="amount" type="number" step="0.01" min="0" placeholder="${t("car.amount")}" style="width:100px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:11px">
          <input name="promised_date" type="date" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:11px">
          <button class="text-[10.5px] cursor-pointer" style="border:1px solid var(--warn);color:var(--warn);background:none;padding:6px 10px">${t("car.addPromise")}</button>
        </form>
      </div>
      <div class="bg-panel border border-line" style="padding:16px 18px">
        <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;margin-bottom:8px">${t("car.historyTitle")}</div>
        ${interRows || `<div class="text-dim text-[11.5px]">${t("car.noInteractions")}</div>`}
      </div>
    </div>
  </div>`;
}

export async function renderCartera(env: Env, q: URLSearchParams): Promise<string> {
  const { t } = await panelI18n(env);
  const repo = new CollectionsRepo(new Db(env.DB));
  const detail = q.get("d");
  if (detail) {
    return layout({ title: t("car.title"), activeTab: "cartera", body: await renderDetail(t, repo, detail), env });
  }

  const search = q.get("q") ?? undefined;
  const listFilter = q.get("lista") ?? undefined;
  const stageFilter = q.get("etapa") ?? undefined;
  const page = Math.max(1, Number(q.get("pagina") ?? 1) || 1);
  const PAGE = 50;
  const { SettingsRepo, SETTING_KEYS } = await import("../../db/settings");
  const [stats, list, lists, report, cfg] = await Promise.all([
    repo.stats(),
    repo.listDebtors({ q: search, listId: listFilter, stage: stageFilter, limit: PAGE, offset: (page - 1) * PAGE }),
    repo.listLists(),
    repo.report(),
    new SettingsRepo(new Db(env.DB)).all().catch(() => ({}) as Record<string, string>),
  ]);
  const fromHour = cfg[SETTING_KEYS.collectionSendFromHour] ?? "8";
  const toHour = cfg[SETTING_KEYS.collectionSendToHour] ?? "19";
  const tzMin = cfg[SETTING_KEYS.collectionTzOffsetMinutes] ?? "-360";

  const importForm = `<form method="POST" action="/admin/cartera/import" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
    <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em">${t("car.importTitle")}</div>
    <div class="text-dim text-[11px]">${t("car.importFormat")} <span class="font-mono">nombre, telefono, monto, vence(YYYY-MM-DD), referencia</span> — ${t("car.importNote")}</div>
    <input name="list_name" placeholder="${t("car.importListName")}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px">
    <textarea name="csv" rows="4" placeholder="Juan Pérez, +50688887777, 250000, 2026-08-15, CLI-001" style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:9px 11px;font-size:12px;resize:vertical;font-family:monospace"></textarea>
    <button class="font-display font-semibold text-[12px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 16px;align-self:flex-start">${t("car.import")}</button>
  </form>`;

  const rows = list.map((d) => debtorRow(t, d)).join("");
  const listOpts = lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${l.n})</option>`).join("");
  const rules = await repo.listRules();
  const chosenRule = q.get("rule") ? rules.find((r) => r.id === q.get("rule")) : null;
  const ruleForm = `<form method="POST" action="/admin/cartera/reglas" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      ${chosenRule ? `<input type="hidden" name="id" value="${esc(chosenRule.id)}">` : ""}
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">${t("car.name")}</span><input name="name" value="${esc(chosenRule?.name ?? "")}" placeholder="${t("car.ruleNamePh")}" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">${t("car.ruleFrom")}</span><input name="min_days" type="number" min="0" value="${chosenRule?.min_days_overdue ?? 1}" style="width:110px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">${t("car.ruleTo")}</span><input name="max_days" type="number" min="0" value="${chosenRule?.max_days_overdue ?? ""}" placeholder="7" style="width:110px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">${t("car.attempts")}</span><input name="max_attempts" type="number" min="1" value="${chosenRule?.max_attempts ?? 3}" style="width:80px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">${t("car.channel")}</span><select name="channel" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"><option value="whatsapp" ${chosenRule?.channel === "whatsapp" ? "selected" : ""}>${t("car.optWhatsapp")}</option><option value="voz" ${chosenRule?.channel === "voz" ? "selected" : ""}>${t("car.optVoice")}</option></select></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">${t("car.colStatus")}</span><select name="active" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"><option value="1" ${!chosenRule || Number(chosenRule.active) === 1 ? "selected" : ""}>${t("car.ruleActive")}</option><option value="0" ${chosenRule && Number(chosenRule.active) === 0 ? "selected" : ""}>${t("car.ruleOff")}</option></select></label>
      <label style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:240px"><span class="text-dim text-[10.5px]">${t("car.ruleTemplate")}</span><input name="template" value="${esc(chosenRule?.template ?? "")}" placeholder="Hola {nombre}, tenés un saldo de {saldo}…" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <button class="font-display font-semibold text-[11.5px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 15px">${chosenRule ? t("car.ruleSave") : t("car.ruleCreate")}</button>
      ${chosenRule ? `<a href="/admin/cartera" class="text-dim text-[11px]" style="text-decoration:none;padding:9px 6px">${t("car.cancelLower")}</a>` : ""}
    </form>`;

  const ruleRows = rules
    .map(
      (r) => `<tr style="border-top:1px solid var(--line)">
        <td class="text-cream" style="padding:7px 10px">${esc(r.name)}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${r.min_days_overdue}${r.max_days_overdue != null ? `–${r.max_days_overdue}` : "+"} d</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${esc(r.channel)}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${r.max_attempts}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${Number(r.active) === 1 ? t("car.activeLower") : t("car.offLower")}</td>
        <td style="padding:7px 10px;display:flex;gap:6px">
          <a href="/admin/cartera?rule=${encodeURIComponent(r.id)}" class="text-accent text-[10.5px]" style="text-decoration:none;border:1px solid var(--line);padding:4px 9px">${t("car.edit")}</a>
          <form method="POST" action="/admin/cartera/reglas/${encodeURIComponent(r.id)}/delete" onsubmit="return confirm('${t("car.confirmDelete")}')">
            <button class="text-[10.5px] cursor-pointer" style="border:1px solid var(--line);color:var(--muted);background:none;padding:4px 9px">${t("car.delete")}</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");

  const rulesBlock = `<details class="bg-panel border border-line" style="padding:14px 16px">
    <summary class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;cursor:pointer">${t("car.rulesTitle", { n: rules.length })}</summary>
    <p class="text-dim text-[11px]" style="margin:8px 0">${t("car.rulesHelp")} <span class="font-mono">{nombre} {negocio} {saldo} {vence} {dias}</span></p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">
      <thead><tr class="text-dim text-[10px]" style="text-align:left;letter-spacing:.1em;text-transform:uppercase"><th style="padding:6px 10px">${t("car.name")}</th><th style="padding:6px 10px">${t("car.colMora")}</th><th style="padding:6px 10px">${t("car.channel")}</th><th style="padding:6px 10px">${t("car.attempts")}</th><th style="padding:6px 10px">${t("car.colStatus")}</th><th></th></tr></thead>
      <tbody>${ruleRows || `<tr><td colspan="6" class="text-dim" style="padding:14px">${t("car.noRules")}</td></tr>`}</tbody>
    </table>
    ${ruleForm}
  </details>`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        ${kpi(t("car.kpi.totalDebt"), money(stats.totalDebt), "var(--cream)")}
        ${kpi(t("car.kpi.overdue"), money(stats.overdue), "var(--bad)")}
        ${kpi(t("car.kpi.promised"), money(stats.promised), "var(--warn)")}
        ${kpi(t("car.kpi.recovered"), money(stats.totalPaid), "var(--ok)")}
        ${kpi(t("car.kpi.debtors"), String(stats.debtors))}
        ${kpi(t("car.kpi.cases"), String(stats.cases))}
      </div>

      ${importForm}

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <form method="POST" action="/admin/cartera/run"><button class="font-display font-semibold text-[11.5px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 15px">${t("car.runNow")}</button></form>
        <a href="/admin/cartera/export.csv" class="text-[11.5px]" style="border:1px solid var(--line);color:var(--muted);padding:9px 13px;text-decoration:none">${t("car.exportCsv")}</a>
      </div>

      ${rulesBlock}

      <div class="bg-panel border border-line" style="padding:14px 16px">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
          <form method="GET" action="/admin/cartera" style="display:flex;gap:8px;flex:1;min-width:240px;flex-wrap:wrap;align-items:center">
            <input name="q" value="${esc(search ?? "")}" placeholder="${t("car.searchPh")}" style="flex:1;min-width:180px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 11px;font-size:12px">
            <select name="lista" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:11.5px">
              <option value="">${t("car.allLists")}</option>
              ${lists.map((l) => `<option value="${esc(l.id)}" ${listFilter === l.id ? "selected" : ""}>${esc(l.name)} (${l.n})</option>`).join("")}
            </select>
            <select name="etapa" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:11.5px">
              <option value="">${t("car.allStages")}</option>
              ${Object.keys(STAGE_KEY).map((s) => `<option value="${s}" ${stageFilter === s ? "selected" : ""}>${stageLabel(t, s)}</option>`).join("")}
            </select>
            <button class="text-[11.5px] cursor-pointer" style="border:1px solid var(--line);color:var(--cream);background:none;padding:8px 13px">${t("car.filter")}</button>
            ${search || listFilter || stageFilter ? `<a href="/admin/cartera" class="text-dim text-[11px]" style="text-decoration:none">${t("car.clear")}</a>` : ""}
          </form>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">
            <thead><tr class="text-dim text-[10px]" style="text-align:left;letter-spacing:.1em;text-transform:uppercase">
              <th style="padding:7px 10px">${t("car.colDebtor")}</th><th style="padding:7px 10px">${t("car.colPhone")}</th><th style="padding:7px 10px">${t("car.colBalance")}</th><th style="padding:7px 10px">${t("car.colDue")}</th><th style="padding:7px 10px">${t("car.colMora")}</th><th style="padding:7px 10px">${t("car.colStage")}</th>
            </tr></thead>
            <tbody>${rows || `<tr><td colspan="6" class="text-dim" style="padding:26px;text-align:center">${t("car.noDebtors")}</td></tr>`}</tbody>
          </table>
        </div>
        ${listOpts ? `<div class="text-dim text-[10.5px] font-mono" style="margin-top:8px">${t("car.listsLabel")} ${esc(lists.map((l) => l.name).join(" · "))}</div>` : ""}
        <div style="display:flex;gap:10px;align-items:center;margin-top:10px;justify-content:flex-end">
          ${page > 1 ? `<a href="/admin/cartera?${new URLSearchParams({ q: search ?? "", lista: listFilter ?? "", etapa: stageFilter ?? "", pagina: String(page - 1) }).toString()}" class="text-[11px] text-accent" style="text-decoration:none">${t("car.prev")}</a>` : ""}
          <span class="text-dim text-[10.5px]">${t("car.page", { n: page })}</span>
          ${list.length >= PAGE ? `<a href="/admin/cartera?${new URLSearchParams({ q: search ?? "", lista: listFilter ?? "", etapa: stageFilter ?? "", pagina: String(page + 1) }).toString()}" class="text-[11px] text-accent" style="text-decoration:none">${t("car.next")}</a>` : ""}
        </div>
      </div>

      <div class="bg-panel border border-line" style="padding:14px 16px">
        <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;margin-bottom:8px">${t("car.reportsTitle")}</div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px">
          <span class="text-muted text-[12px]">${t("car.recovery")} <b class="text-cream">${(report.recoveryRate * 100).toFixed(1)}%</b></span>
          <span class="text-muted text-[12px]">${t("car.recovered")} <b class="text-cream">${money(report.totalPaid)}</b></span>
          <span class="text-muted text-[12px]">${t("car.pending")} <b class="text-cream">${money(report.totalDebt)}</b></span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr class="text-dim text-[10px]" style="text-align:left;letter-spacing:.1em;text-transform:uppercase"><th style="padding:6px 10px">${t("car.channel")}</th><th style="padding:6px 10px">${t("car.attempts")}</th><th style="padding:6px 10px">${t("car.contacted")}</th><th style="padding:6px 10px">${t("car.promises")}</th><th style="padding:6px 10px">${t("car.payments")}</th></tr></thead>
          <tbody>${report.byChannel.map((c) => `<tr style="border-top:1px solid var(--line)"><td class="text-cream" style="padding:6px 10px">${esc(c.channel)}</td><td class="text-muted" style="padding:6px 10px">${c.intentos}</td><td class="text-muted" style="padding:6px 10px">${c.contactados ?? 0}</td><td class="text-muted" style="padding:6px 10px">${c.promesas ?? 0}</td><td class="text-muted" style="padding:6px 10px">${c.pagos ?? 0}</td></tr>`).join("") || `<tr><td colspan="5" class="text-dim" style="padding:14px">${t("car.noInteractions")}</td></tr>`}</tbody>
        </table>
        ${report.byStage.length ? `<div class="text-dim text-[10.5px] font-mono" style="margin-top:8px">${t("car.funnel")} ${esc(report.byStage.map((s) => `${s.stage} ${s.n}`).join(" · "))}</div>` : ""}
      </div>

      <details class="bg-panel border border-line" style="padding:14px 16px">
        <summary class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;cursor:pointer">${t("car.windowTitle")}</summary>
        <p class="text-dim text-[11px]" style="margin:8px 0">${t("car.windowHelp")}</p>
        <form method="POST" action="/admin/cartera/settings" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">${t("car.fromHour")}</span><input name="from_hour" type="number" min="0" max="23" value="${esc(fromHour)}" style="width:90px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
          <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">${t("car.toHour")}</span><input name="to_hour" type="number" min="0" max="24" value="${esc(toHour)}" style="width:90px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
          <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">${t("car.tzOffset")}</span><input name="tz_offset" type="number" value="${esc(tzMin)}" style="width:110px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
          <button class="font-display font-semibold text-[11.5px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 15px">${t("common.save")}</button>
        </form>
      </details>
    </div>`;

  return layout({ title: t("car.title"), activeTab: "cartera", body, env });
}
