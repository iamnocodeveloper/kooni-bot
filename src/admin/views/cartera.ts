import type { Env } from "../../env";
import { Db } from "../../db/client";
import { CollectionsRepo, daysOverdue, type DebtorRow } from "../../db/collections";
import { layout } from "./layout";
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

const STAGE_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  recordatorio: "Recordatorio",
  negociacion: "Negociación",
  promesa: "Promesa de pago",
  escalado: "Escalado",
  pagado: "Pagado",
  incobrable: "Incobrable",
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

function stagePill(stage: string | null): string {
  const s = stage ?? "nuevo";
  const c = STAGE_COLOR[s] ?? "var(--muted)";
  return `<span class="text-[10px]" style="color:${c};border:1px solid ${c};padding:1px 6px;white-space:nowrap">${esc(STAGE_LABEL[s] ?? s)}</span>`;
}

function debtorRow(d: DebtorRow): string {
  const mora = daysOverdue(d.next_due);
  return `<tr style="border-top:1px solid var(--line)">
    <td style="padding:8px 10px"><a href="/admin/cartera?d=${encodeURIComponent(d.id)}" class="text-accent" style="text-decoration:none">${esc(d.name) || "(sin nombre)"}</a></td>
    <td class="text-muted" style="padding:8px 10px;font-size:11px">${esc(d.phone) || "—"}</td>
    <td class="text-cream" style="padding:8px 10px;font-family:'Sora';font-weight:600">${money(d.balance)}</td>
    <td class="text-muted" style="padding:8px 10px;font-size:11px">${d.next_due ? fmtDate(d.next_due) : "—"}</td>
    <td style="padding:8px 10px">${mora > 0 ? `<span class="text-[10px]" style="color:var(--bad)">${mora} d</span>` : `<span class="text-dim text-[10px]">al día</span>`}</td>
    <td style="padding:8px 10px">${stagePill(d.stage)}</td>
  </tr>`;
}

async function renderDetail(repo: CollectionsRepo, id: string): Promise<string> {
  const d = await repo.getDebtor(id);
  if (!d) return `<div class="bg-panel border border-line" style="padding:24px"><p class="text-dim text-[12.5px]">Deudor no encontrado.</p></div>`;
  const accounts = await repo.listAccounts(id);
  const inter = await repo.listInteractions(id, 20);
  const promises = await repo.listPromises(id);

  const accRows = accounts
    .map(
      (a) => `<tr style="border-top:1px solid var(--line)">
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${esc(a.concept) || "Deuda"}</td>
        <td class="text-cream" style="padding:7px 10px;font-size:11.5px">${money(a.amount)}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${money(a.amount - a.paid)}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${a.due_date ? fmtDate(a.due_date) : "—"}</td>
        <td style="padding:7px 10px"><span class="text-[10px] text-dim">${esc(a.status)}</span></td>
        <td style="padding:7px 10px">
          <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/payment" style="display:flex;gap:6px">
            <input type="hidden" name="account_id" value="${esc(a.id)}">
            <input name="amount" type="number" step="0.01" min="0" placeholder="monto" style="width:90px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:5px 7px;font-size:11px">
            <button class="text-[10.5px] cursor-pointer" style="border:1px solid var(--ok);color:var(--ok);background:none;padding:5px 9px">Pago</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");

  const promRows = promises
    .map(
      (p) => `<div style="display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--line)" class="text-[11.5px]">
        <span class="text-cream">${money(p.amount)}</span>
        <span class="text-muted">${p.promised_date ? fmtDate(p.promised_date) : "sin fecha"}</span>
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
  const stageOpts = Object.keys(STAGE_LABEL)
    .map((s) => `<option value="${s}" ${s === stage ? "selected" : ""}>${STAGE_LABEL[s]}</option>`)
    .join("");

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div class="bg-panel border border-line" style="padding:16px 18px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <a href="/admin/cartera" class="text-dim" style="text-decoration:none;font-size:12px">← Cartera</a>
        <span class="font-display font-semibold text-[15px] text-cream">${esc(d.name) || "(sin nombre)"}</span>
        ${stagePill(stage)}
        ${d.phone ? `<a href="https://wa.me/${esc((d.phone || "").replace(/\D/g, ""))}" target="_blank" rel="noopener" class="text-accent" style="font-size:11.5px">${esc(d.phone)}</a>` : ""}
        ${d.document_id ? `<span class="text-dim text-[11px]">Doc: ${esc(d.document_id)}</span>` : ""}
        <span class="text-cream" style="margin-left:auto;font-family:'Sora';font-weight:600">Saldo ${money(d.balance)}</span>
      </div>
      <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/stage" style="display:flex;gap:8px;margin-top:12px;align-items:center">
        <span class="text-dim text-[11px]">Etapa</span>
        <select name="stage" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 9px;font-size:11.5px">${stageOpts}</select>
        <button class="text-[11px] cursor-pointer" style="border:1px solid var(--accent);color:var(--accent);background:none;padding:6px 12px">Guardar</button>
        <input name="note" placeholder="nota (opcional)" style="flex:1;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 9px;font-size:11.5px">
      </form>
      <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/call" style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="text-[11.5px] cursor-pointer" style="border:1px solid var(--accent);color:var(--accent);background:none;padding:7px 13px">📞 Llamar con IA (Vapi/Retell)</button>
        <span class="text-dim text-[10.5px]">Requiere Vapi o Retell configurado en Conexiones.</span>
      </form>
      <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/dnc" style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <input type="hidden" name="on" value="${d.dnc && Number(d.dnc) > 0 ? "0" : "1"}">
        <button class="text-[11.5px] cursor-pointer" style="border:1px solid ${d.dnc && Number(d.dnc) > 0 ? "var(--ok)" : "var(--bad)"};color:${d.dnc && Number(d.dnc) > 0 ? "var(--ok)" : "var(--bad)"};background:none;padding:7px 13px">${d.dnc && Number(d.dnc) > 0 ? "✔ No contactar (activo) — reactivar" : "🚫 Marcar: no contactar"}</button>
        ${d.dnc && Number(d.dnc) > 0 ? `<span class="text-[10.5px]" style="color:var(--bad)">Opt-out: el motor no le escribirá.</span>` : ""}
      </form>
    </div>

    <div class="bg-panel border border-line" style="padding:16px 18px">
      <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;margin-bottom:8px">DEUDA</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr class="text-dim text-[10px]" style="text-align:left"><th style="padding:6px 10px">Concepto</th><th style="padding:6px 10px">Monto</th><th style="padding:6px 10px">Saldo</th><th style="padding:6px 10px">Vence</th><th style="padding:6px 10px">Estado</th><th></th></tr></thead>
        <tbody>${accRows || `<tr><td colspan="6" class="text-dim" style="padding:14px">Sin deudas registradas.</td></tr>`}</tbody>
      </table>
      <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/account" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <input name="amount" type="number" step="0.01" min="0" placeholder="monto" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px">
        <input name="concept" placeholder="concepto" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px">
        <input name="due_date" type="date" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px">
        <button class="text-[11px] cursor-pointer" style="border:1px solid var(--line);color:var(--cream);background:none;padding:7px 12px">Agregar deuda</button>
      </form>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="bg-panel border border-line" style="padding:16px 18px">
        <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;margin-bottom:8px">PROMESAS DE PAGO</div>
        ${promRows || `<div class="text-dim text-[11.5px]">Sin promesas.</div>`}
        <form method="POST" action="/admin/cartera/debtor/${encodeURIComponent(id)}/promise" style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <input name="amount" type="number" step="0.01" min="0" placeholder="monto" style="width:100px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:11px">
          <input name="promised_date" type="date" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:11px">
          <button class="text-[10.5px] cursor-pointer" style="border:1px solid var(--warn);color:var(--warn);background:none;padding:6px 10px">Registrar promesa</button>
        </form>
      </div>
      <div class="bg-panel border border-line" style="padding:16px 18px">
        <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;margin-bottom:8px">HISTORIAL</div>
        ${interRows || `<div class="text-dim text-[11.5px]">Sin gestiones registradas.</div>`}
      </div>
    </div>
  </div>`;
}

export async function renderCartera(env: Env, q: URLSearchParams): Promise<string> {
  const repo = new CollectionsRepo(new Db(env.DB));
  const detail = q.get("d");
  if (detail) {
    return layout({ title: "Cartera", activeTab: "cartera", body: await renderDetail(repo, detail), env });
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
    <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em">IMPORTAR CARTERA (una línea por deudor)</div>
    <div class="text-dim text-[11px]">Formato: <span class="font-mono">nombre, telefono, monto, vence(YYYY-MM-DD), referencia</span> — la referencia evita duplicados.</div>
    <input name="list_name" placeholder="Nombre de la lista (ej. Cartera agosto)" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px">
    <textarea name="csv" rows="4" placeholder="Juan Pérez, +50688887777, 250000, 2026-08-15, CLI-001" style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:9px 11px;font-size:12px;resize:vertical;font-family:monospace"></textarea>
    <button class="font-display font-semibold text-[12px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 16px;align-self:flex-start">Importar</button>
  </form>`;

  const rows = list.map(debtorRow).join("");
  const listOpts = lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${l.n})</option>`).join("");
  const rules = await repo.listRules();
  const chosenRule = q.get("rule") ? rules.find((r) => r.id === q.get("rule")) : null;
  const ruleForm = `<form method="POST" action="/admin/cartera/reglas" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      ${chosenRule ? `<input type="hidden" name="id" value="${esc(chosenRule.id)}">` : ""}
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">Nombre</span><input name="name" value="${esc(chosenRule?.name ?? "")}" placeholder="Recordatorio 1-7 días" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">Mora desde (días)</span><input name="min_days" type="number" min="0" value="${chosenRule?.min_days_overdue ?? 1}" style="width:110px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">Mora hasta (opcional)</span><input name="max_days" type="number" min="0" value="${chosenRule?.max_days_overdue ?? ""}" placeholder="7" style="width:110px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">Intentos</span><input name="max_attempts" type="number" min="1" value="${chosenRule?.max_attempts ?? 3}" style="width:80px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">Canal</span><select name="channel" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"><option value="whatsapp" ${chosenRule?.channel === "whatsapp" ? "selected" : ""}>WhatsApp (mensaje)</option><option value="voz" ${chosenRule?.channel === "voz" ? "selected" : ""}>Voz (llamada IA)</option></select></label>
      <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">Estado</span><select name="active" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"><option value="1" ${!chosenRule || Number(chosenRule.active) === 1 ? "selected" : ""}>Activa</option><option value="0" ${chosenRule && Number(chosenRule.active) === 0 ? "selected" : ""}>Apagada</option></select></label>
      <label style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:240px"><span class="text-dim text-[10.5px]">Plantilla (opcional)</span><input name="template" value="${esc(chosenRule?.template ?? "")}" placeholder="Hola {nombre}, tenés un saldo de {saldo}…" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
      <button class="font-display font-semibold text-[11.5px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 15px">${chosenRule ? "Guardar cambios" : "Crear regla"}</button>
      ${chosenRule ? `<a href="/admin/cartera" class="text-dim text-[11px]" style="text-decoration:none;padding:9px 6px">cancelar</a>` : ""}
    </form>`;

  const ruleRows = rules
    .map(
      (r) => `<tr style="border-top:1px solid var(--line)">
        <td class="text-cream" style="padding:7px 10px">${esc(r.name)}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${r.min_days_overdue}${r.max_days_overdue != null ? `–${r.max_days_overdue}` : "+"} d</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${esc(r.channel)}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${r.max_attempts}</td>
        <td class="text-muted" style="padding:7px 10px;font-size:11.5px">${Number(r.active) === 1 ? "activa" : "apagada"}</td>
        <td style="padding:7px 10px;display:flex;gap:6px">
          <a href="/admin/cartera?rule=${encodeURIComponent(r.id)}" class="text-accent text-[10.5px]" style="text-decoration:none;border:1px solid var(--line);padding:4px 9px">Editar</a>
          <form method="POST" action="/admin/cartera/reglas/${encodeURIComponent(r.id)}/delete" onsubmit="return confirm('¿Borrar regla?')">
            <button class="text-[10.5px] cursor-pointer" style="border:1px solid var(--line);color:var(--muted);background:none;padding:4px 9px">Borrar</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");

  const rulesBlock = `<details class="bg-panel border border-line" style="padding:14px 16px">
    <summary class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;cursor:pointer">REGLAS DE COBRANZA — recordatorios por mora (${rules.length})</summary>
    <p class="text-dim text-[11px]" style="margin:8px 0">Una regla = un tramo de mora (días) + canal + plantilla + intentos máximos. Variables: <span class="font-mono">{nombre} {negocio} {saldo} {vence} {dias}</span></p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">
      <thead><tr class="text-dim text-[10px]" style="text-align:left;letter-spacing:.1em;text-transform:uppercase"><th style="padding:6px 10px">Nombre</th><th style="padding:6px 10px">Mora</th><th style="padding:6px 10px">Canal</th><th style="padding:6px 10px">Intentos</th><th style="padding:6px 10px">Estado</th><th></th></tr></thead>
      <tbody>${ruleRows || `<tr><td colspan="6" class="text-dim" style="padding:14px">Sin reglas todavía — creá la primera abajo.</td></tr>`}</tbody>
    </table>
    ${ruleForm}
  </details>`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        ${kpi("Deuda total", money(stats.totalDebt), "var(--cream)")}
        ${kpi("En mora", money(stats.overdue), "var(--bad)")}
        ${kpi("En promesa", money(stats.promised), "var(--warn)")}
        ${kpi("Recuperado", money(stats.totalPaid), "var(--ok)")}
        ${kpi("Deudores", String(stats.debtors))}
        ${kpi("Gestiones activas", String(stats.cases))}
      </div>

      ${importForm}

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <form method="POST" action="/admin/cartera/run"><button class="font-display font-semibold text-[11.5px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 15px">▶ Correr cobranza ahora</button></form>
        <a href="/admin/cartera/export.csv" class="text-[11.5px]" style="border:1px solid var(--line);color:var(--muted);padding:9px 13px;text-decoration:none">⬇ Exportar CSV</a>
      </div>

      ${rulesBlock}

      <div class="bg-panel border border-line" style="padding:14px 16px">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
          <form method="GET" action="/admin/cartera" style="display:flex;gap:8px;flex:1;min-width:240px;flex-wrap:wrap;align-items:center">
            <input name="q" value="${esc(search ?? "")}" placeholder="Buscar por nombre, teléfono, doc o ref…" style="flex:1;min-width:180px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 11px;font-size:12px">
            <select name="lista" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:11.5px">
              <option value="">Todas las listas</option>
              ${lists.map((l) => `<option value="${esc(l.id)}" ${listFilter === l.id ? "selected" : ""}>${esc(l.name)} (${l.n})</option>`).join("")}
            </select>
            <select name="etapa" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:11.5px">
              <option value="">Todas las etapas</option>
              ${Object.keys(STAGE_LABEL).map((s) => `<option value="${s}" ${stageFilter === s ? "selected" : ""}>${STAGE_LABEL[s]}</option>`).join("")}
            </select>
            <button class="text-[11.5px] cursor-pointer" style="border:1px solid var(--line);color:var(--cream);background:none;padding:8px 13px">Filtrar</button>
            ${search || listFilter || stageFilter ? `<a href="/admin/cartera" class="text-dim text-[11px]" style="text-decoration:none">limpiar</a>` : ""}
          </form>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">
            <thead><tr class="text-dim text-[10px]" style="text-align:left;letter-spacing:.1em;text-transform:uppercase">
              <th style="padding:7px 10px">Deudor</th><th style="padding:7px 10px">Teléfono</th><th style="padding:7px 10px">Saldo</th><th style="padding:7px 10px">Vence</th><th style="padding:7px 10px">Mora</th><th style="padding:7px 10px">Etapa</th>
            </tr></thead>
            <tbody>${rows || `<tr><td colspan="6" class="text-dim" style="padding:26px;text-align:center">Todavía no hay deudores. Importá tu cartera arriba.</td></tr>`}</tbody>
          </table>
        </div>
        ${listOpts ? `<div class="text-dim text-[10.5px] font-mono" style="margin-top:8px">listas: ${esc(lists.map((l) => l.name).join(" · "))}</div>` : ""}
        <div style="display:flex;gap:10px;align-items:center;margin-top:10px;justify-content:flex-end">
          ${page > 1 ? `<a href="/admin/cartera?${new URLSearchParams({ q: search ?? "", lista: listFilter ?? "", etapa: stageFilter ?? "", pagina: String(page - 1) }).toString()}" class="text-[11px] text-accent" style="text-decoration:none">← anterior</a>` : ""}
          <span class="text-dim text-[10.5px]">página ${page}</span>
          ${list.length >= PAGE ? `<a href="/admin/cartera?${new URLSearchParams({ q: search ?? "", lista: listFilter ?? "", etapa: stageFilter ?? "", pagina: String(page + 1) }).toString()}" class="text-[11px] text-accent" style="text-decoration:none">siguiente →</a>` : ""}
        </div>
      </div>

      <div class="bg-panel border border-line" style="padding:14px 16px">
        <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;margin-bottom:8px">REPORTES DE COBRANZA</div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px">
          <span class="text-muted text-[12px]">Recuperación: <b class="text-cream">${(report.recoveryRate * 100).toFixed(1)}%</b></span>
          <span class="text-muted text-[12px]">Recuperado: <b class="text-cream">${money(report.totalPaid)}</b></span>
          <span class="text-muted text-[12px]">Pendiente: <b class="text-cream">${money(report.totalDebt)}</b></span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr class="text-dim text-[10px]" style="text-align:left;letter-spacing:.1em;text-transform:uppercase"><th style="padding:6px 10px">Canal</th><th style="padding:6px 10px">Intentos</th><th style="padding:6px 10px">Contactados</th><th style="padding:6px 10px">Promesas</th><th style="padding:6px 10px">Pagos</th></tr></thead>
          <tbody>${report.byChannel.map((c) => `<tr style="border-top:1px solid var(--line)"><td class="text-cream" style="padding:6px 10px">${esc(c.channel)}</td><td class="text-muted" style="padding:6px 10px">${c.intentos}</td><td class="text-muted" style="padding:6px 10px">${c.contactados ?? 0}</td><td class="text-muted" style="padding:6px 10px">${c.promesas ?? 0}</td><td class="text-muted" style="padding:6px 10px">${c.pagos ?? 0}</td></tr>`).join("") || `<tr><td colspan="5" class="text-dim" style="padding:14px">Sin gestiones registradas.</td></tr>`}</tbody>
        </table>
        ${report.byStage.length ? `<div class="text-dim text-[10.5px] font-mono" style="margin-top:8px">embudo: ${esc(report.byStage.map((s) => `${s.stage} ${s.n}`).join(" · "))}</div>` : ""}
      </div>

      <details class="bg-panel border border-line" style="padding:14px 16px">
        <summary class="text-dim text-[10px] font-mono" style="letter-spacing:.12em;cursor:pointer">VENTANA DE ENVÍO (horario del negocio)</summary>
        <p class="text-dim text-[11px]" style="margin:8px 0">El motor no escribe fuera de esta franja (hora local). El botón “correr ahora” la ignora.</p>
        <form method="POST" action="/admin/cartera/settings" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">Desde (hora)</span><input name="from_hour" type="number" min="0" max="23" value="${esc(fromHour)}" style="width:90px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
          <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">Hasta (hora)</span><input name="to_hour" type="number" min="0" max="24" value="${esc(toHour)}" style="width:90px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
          <label style="display:flex;flex-direction:column;gap:3px"><span class="text-dim text-[10.5px]">Offset UTC (min)</span><input name="tz_offset" type="number" value="${esc(tzMin)}" style="width:110px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:11.5px"></label>
          <button class="font-display font-semibold text-[11.5px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 15px">Guardar</button>
        </form>
      </details>
    </div>`;

  return layout({ title: "Cartera", activeTab: "cartera", body, env });
}
