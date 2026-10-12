// Vista "Laboratorio": corre escenarios y clientes simulados contra el agente
// REAL (en sandbox) y muestra el score, los fallos con su razón, el delta vs. la
// corrida anterior y los hallazgos (que se envían a Mejoras). Ver src/lab/*.
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { LabRepo, type LabRun, type LabResultRow } from "../../db/lab";
import { computeDelta } from "../../lab/delta";
import { DEFAULT_LAB_THRESHOLD } from "../../lab/run";
import { panelI18n, type T } from "../i18n";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const pct = (n: number) => `${Math.round(n * 100)}%`;
const money = (n: number) => `$${(Math.round(n * 1000) / 1000).toFixed(3)}`;
function when(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function resultRow(t: T, r: LabResultRow): string {
  const ok = r.passed === 1;
  const tools = r.tool_calls ? (JSON.parse(r.tool_calls) as string[]).join(", ") : "";
  return `<div class="border" style="border-color:${ok ? "var(--line)" : "var(--bad)"};padding:10px 12px;display:flex;flex-direction:column;gap:4px;background:var(--panel2)">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
      <span style="font-weight:600;color:var(--cream);font-size:13px">${ok ? "✓" : "✗"} ${esc(r.label ?? r.scenario_id)}</span>
      <span class="text-dim text-[11px]">${esc(r.category ?? "")}${r.turns ? ` · ${r.turns} ${t("laboratorio.turns")}` : ""}</span>
    </div>
    ${r.reason ? `<div class="text-muted" style="font-size:12px">${esc(r.reason)}</div>` : ""}
    ${tools ? `<div class="text-dim text-[11px]">${t("laboratorio.toolUsed")} ${esc(tools)}</div>` : ""}
  </div>`;
}

function runSummary(t: T, run: LabRun, results: LabResultRow[], deltaHtml: string): string {
  const rate = run.pass_rate ?? 0;
  const color = run.meets_threshold ? "var(--ok)" : "var(--bad)";
  const statusLabel = run.status === "running" ? t("laboratorio.running") : run.status === "error" ? t("laboratorio.error") : "";
  return `<div class="bg-panel border border-line" style="padding:16px;display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
      <div>
        <div class="font-mono" style="font-size:30px;font-weight:700;color:${color}">${pct(rate)}</div>
        <div class="text-dim text-[11.5px]">${t("laboratorio.score")} · ${run.passed} ✓ / ${run.failed} ✗ · ${t("laboratorio.threshold")} ${pct(run.threshold)}</div>
      </div>
      <div class="text-dim text-[11.5px]" style="text-align:right">
        <div>${run.kind === "quick" ? t("laboratorio.kind.quick") : t("laboratorio.kind.personas")}</div>
        <div>${esc(when(run.started_at))}${run.cost ? ` · ${money(run.cost)}` : ""}</div>
        ${statusLabel ? `<div style="color:var(--warn)">${esc(statusLabel)}</div>` : ""}
      </div>
    </div>
    <div style="height:8px;background:var(--bg);border:1px solid var(--line)"><div style="height:100%;width:${Math.round(rate * 100)}%;background:${color}"></div></div>
    ${deltaHtml}
    <div style="display:flex;flex-direction:column;gap:6px">${results.map((r) => resultRow(t, r)).join("")}</div>
  </div>`;
}

export async function renderLaboratorio(env: Env, runId?: string): Promise<string> {
  const { t } = await panelI18n(env);
  const repo = new LabRepo(new Db(env.DB));
  const runs = await repo.listRuns(undefined, 12);
  const selected = runId ? await repo.getRun(runId) : runs[0] ?? null;
  const results = selected ? await repo.results(selected.id) : [];

  let deltaHtml = "";
  if (selected && selected.status === "done") {
    const prev = await repo.previousRun(selected.kind, selected.started_at);
    if (prev) {
      const prevResults = await repo.results(prev.id);
      const d = computeDelta(
        prevResults.map((r) => ({ scenario_id: r.scenario_id, passed: r.passed === 1, category: r.category })),
        results.map((r) => ({ scenario_id: r.scenario_id, passed: r.passed === 1, category: r.category })),
      );
      const arrow = d.passRateDelta > 0 ? "▲" : d.passRateDelta < 0 ? "▼" : "=";
      const dcolor = d.passRateDelta > 0 ? "var(--ok)" : d.passRateDelta < 0 ? "var(--bad)" : "var(--dim)";
      deltaHtml = `<div class="text-[12px]" style="border-top:1px solid var(--line);padding-top:8px;display:flex;flex-direction:column;gap:3px">
        <div>${t("laboratorio.delta.vs")}: <span style="color:${dcolor};font-weight:700">${arrow} ${pct(Math.abs(d.passRateDelta))}</span> (${pct(d.prevPassRate)} → ${pct(d.currPassRate)})</div>
        ${d.broke.length ? `<div style="color:var(--bad)">${t("laboratorio.broke")} ${esc(d.broke.join(", "))}</div>` : ""}
        ${d.fixed.length ? `<div style="color:var(--ok)">${t("laboratorio.fixed")} ${esc(d.fixed.join(", "))}</div>` : ""}
      </div>`;
    } else {
      deltaHtml = `<div class="text-dim text-[12px]">${t("laboratorio.delta.none")}</div>`;
    }
  }

  const failedCount = results.filter((r) => r.passed === 0).length;
  const findingsHtml =
    selected && selected.status === "done" && failedCount > 0
      ? `<div class="border" style="border-color:var(--warn);background:var(--panel2);padding:11px 13px;font-size:12.5px;color:var(--warn)">
          ${t("laboratorio.findings", { n: failedCount })} → <a href="/admin/mejoras" style="color:var(--accent)">${t("laboratorio.findings.link")}</a>
        </div>`
      : "";

  const runBtn = (kind: "quick" | "personas", label: string) =>
    `<form method="POST" action="/admin/laboratorio/run" style="display:inline">
      <input type="hidden" name="kind" value="${kind}">
      <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 16px;font-size:12.5px;font-weight:700;cursor:pointer">${label}</button>
    </form>`;

  const historyHtml = runs.length
    ? `<div style="display:flex;flex-direction:column;gap:6px">
        <h3 class="font-display font-semibold text-[13px] text-cream">${t("laboratorio.history")}</h3>
        ${runs
          .map(
            (r) => `<a href="/admin/laboratorio/run/${r.id}" class="text-muted" style="font-size:12px;text-decoration:none;display:flex;justify-content:space-between;border:1px solid var(--line);padding:6px 10px">
              <span>${r.kind === "quick" ? t("laboratorio.kind.quick") : t("laboratorio.kind.personas")} · ${esc(when(r.started_at))}</span>
              <span class="font-mono" style="color:${r.meets_threshold ? "var(--ok)" : "var(--bad)"}">${r.pass_rate != null ? pct(r.pass_rate) : r.status}</span>
            </a>`,
          )
          .join("")}
      </div>`
    : "";

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("laboratorio.title")}</h2>
        <p class="text-muted text-[12.5px]">${t("laboratorio.subtitle")}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${runBtn("quick", t("laboratorio.run.quick"))}${runBtn("personas", t("laboratorio.run.personas"))}</div>
      ${findingsHtml}
      ${selected ? runSummary(t, selected, results, deltaHtml) : `<div class="text-dim text-[12.5px]" style="padding:24px;text-align:center">${t("laboratorio.empty")}</div>`}
      ${historyHtml}
    </div>
    ${selected && selected.status === "running" ? `<script>setTimeout(function(){location.reload()},5000)</script>` : ""}`;

  return layout({ title: t("laboratorio.title"), activeTab: "laboratorio", body, env });
}

export { DEFAULT_LAB_THRESHOLD };
