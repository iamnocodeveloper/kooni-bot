// Vista "Reportes" del nicho TAXIS — los 6 reportes en UNA pantalla.
// Cada card termina en una ACCIÓN sugerida (caja acento), no en un número.
// Datos: src/reports/taxis.ts. Filtro por rango de fechas + export CSV.
import type { Env } from "../../env";
import { layout } from "./layout";
import { buildTaxiReports, type TaxiReports, type ReportWindow } from "../../reports/taxis";

const DAY = 86_400_000;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const money = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
};
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function delta(pct: number | null): string {
  if (pct === null) return `<span class="text-dim text-[11px]">sin comparación</span>`;
  const c = pct > 2 ? "var(--ok)" : pct < -2 ? "var(--bad)" : "var(--muted)";
  return `<span style="color:${c};font-size:11px;font-weight:600">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs. período anterior</span>`;
}

function sparkline(byDay: { day: string; total: number }[]): string {
  if (byDay.length < 2) return `<div class="text-dim text-[11px] py-3">Poca actividad para graficar.</div>`;
  const w = 320, h = 54, pad = 4;
  const max = Math.max(...byDay.map((d) => d.total), 1);
  const step = (w - 2 * pad) / (byDay.length - 1);
  const pts = byDay.map((d, i) => `${(pad + i * step).toFixed(1)},${(h - pad - (d.total / max) * (h - 2 * pad)).toFixed(1)}`).join(" ");
  return `<div class="overflow-x-auto"><svg viewBox="0 0 ${w} ${h}" style="width:100%;min-width:260px" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
  </svg></div>`;
}

function barList(items: { label: string; value: string; pct: number }[]): string {
  if (!items.length) return `<div class="text-dim text-[11px] py-2">Sin datos.</div>`;
  return items
    .map(
      (it) => `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0">
        <span class="text-muted" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.label)}</span>
        <div style="width:64px;height:8px;background:var(--panel2);border:1px solid var(--line)"><div style="width:${Math.max(3, Math.min(100, it.pct))}%;height:100%;background:var(--accent);opacity:.85"></div></div>
        <span class="text-dim" style="font-size:11px;min-width:64px;text-align:right">${esc(it.value)}</span>
      </div>`,
    )
    .join("");
}

function card(title: string, headline: string, sub: string, body: string, action: string): string {
  return `<div class="bg-panel border border-line" style="padding:16px 18px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;flex-direction:column;gap:2px">
      <span class="font-display font-semibold text-[13px] text-cream">${esc(title)}</span>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span class="text-cream" style="font-size:22px;font-weight:700;font-family:'IBM Plex Mono',monospace">${headline}</span>
        ${sub}
      </div>
    </div>
    ${body}
    <div style="border:1px solid var(--accent);background:var(--accent-soft,rgba(224,95,216,.08));padding:9px 11px;font-size:12px;line-height:1.45;color:var(--cream)">
      <span class="text-accent" style="font-weight:700">→ </span>${esc(action)}
    </div>
  </div>`;
}

function renderCards(r: TaxiReports): string {
  const c1 = card(
    "1 · Viajes",
    `${r.viajes.total}`,
    `${delta(r.viajes.deltaPct)} <span class="text-dim text-[11px]">· ${r.viajes.completados} completados${r.viajes.cancelados ? ` · ${r.viajes.cancelados} cancelados` : ""}${r.viajes.sinConductor ? ` · ${r.viajes.sinConductor} sin conductor` : ""}</span>`,
    sparkline(r.viajes.byDay),
    r.viajes.action,
  );

  const baseMax = Math.max(...r.bases.rows.map((b) => b.trips), 1);
  const c2 = card(
    "2 · Viajes por base",
    `${r.bases.rows.length}`,
    `<span class="text-dim text-[11px]">bases con viajes completados</span>`,
    barList(r.bases.rows.slice(0, 6).map((b) => ({ label: b.name, value: `${b.trips}`, pct: (b.trips / baseMax) * 100 }))),
    r.bases.action,
  );

  const drvMax = Math.max(...r.conductores.rows.map((c) => c.trips), 1);
  const c3 = card(
    "3 · Ranking de conductores",
    `${r.conductores.rows.length}`,
    `<span class="text-dim text-[11px]">con viajes completados</span>`,
    barList(r.conductores.rows.slice(0, 6).map((c) => ({ label: c.name, value: `${c.trips}`, pct: (c.trips / drvMax) * 100 }))),
    r.conductores.action,
  );

  const zMax = Math.max(...r.zonas.rows.map((z) => z.n), 1);
  const c4 = card(
    "4 · Demanda por zona",
    r.zonas.rows[0]?.zone ?? "—",
    `<span class="text-dim text-[11px]">la zona que más pide</span>`,
    barList(r.zonas.rows.slice(0, 6).map((z) => ({ label: z.zone, value: `${z.n}`, pct: (z.n / zMax) * 100 }))),
    r.zonas.action,
  );

  const c5 = card(
    "5 · Ingreso estimado",
    money(r.tarifas.total),
    `<span class="text-dim text-[11px]">promedio ${money(r.tarifas.avg)} por viaje</span>`,
    `<div class="text-dim text-[11px]">Calculado con la tarifa base + la tarifa de zona cargadas en Bases. Es un estimado, no caja real.</div>`,
    r.tarifas.action,
  );

  const conv = r.salud.conversionPct;
  const c6 = card(
    "6 · Salud del bot",
    conv !== null ? `${conv}%` : "—",
    `<span class="text-dim text-[11px]">conversaciones → viaje</span>`,
    `<div class="text-[12px] text-muted" style="display:flex;flex-direction:column;gap:2px">
       <span>${r.salud.viajesBot} viajes por el bot · ${r.salud.viajesSinHumano} sin intervención</span>
       <span>${r.salud.abandonadas} conversaciones abandonadas</span>
       <span>Costo IA del período: <b class="text-cream">${money(r.salud.costoIA)}</b>${r.salud.costoPorViaje !== null ? ` · ${money(r.salud.costoPorViaje)}/viaje` : ""}</span>
     </div>`,
    r.salud.action,
  );

  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">${c1}${c2}${c3}${c4}${c5}${c6}</div>`;
}

export async function renderReportesTaxis(env: Env, win: ReportWindow): Promise<string> {
  const r = await buildTaxiReports(env, win);
  const from = ymd(win.from);
  const to = ymd(win.to - DAY);

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Reportes de la central de taxis</h2>
        <p class="text-muted text-[12.5px]">Seis números para decidir. Cada uno termina en una acción, no en un dato.</p>
      </div>

      <form method="GET" action="/admin/reportes" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--muted)">Desde
          <input type="date" name="desde" value="${from}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12px">
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--muted)">Hasta
          <input type="date" name="hasta" value="${to}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12px">
        </label>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);font-weight:700;border:none;padding:8px 16px;font-size:12px;cursor:pointer">Ver</button>
        <a href="/admin/reportes/export.csv?desde=${from}&hasta=${to}" style="border:1px solid var(--line);color:var(--muted);padding:8px 14px;font-size:12px;text-decoration:none">⬇ CSV</a>
      </form>

      ${renderCards(r)}
    </div>`;

  return layout({ title: "Reportes", activeTab: "reportes", body, env });
}
