// Vista "Reportes" del nicho RESTAURANTE — los 6 reportes en UNA pantalla.
// Cada card termina en una ACCIÓN sugerida (caja acento), no en un número.
// Datos: src/reports/restaurante.ts. Filtro por rango de fechas + export CSV.
import type { Env } from "../../env";
import { layout } from "./layout";
import { buildRestaurantReports, type RestaurantReports, type ReportWindow } from "../../reports/restaurante";

const DAY = 86_400_000;
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const money = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
};
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Rango desde los query params (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD). Default: 30 días. */
export function windowFromQuery(q: URLSearchParams): ReportWindow {
  const parse = (s: string | null) => {
    if (!s) return null;
    const t = Date.parse(s + "T00:00:00Z");
    return Number.isNaN(t) ? null : t;
  };
  const to = (parse(q.get("hasta")) ?? Date.now()) + (q.get("hasta") ? DAY : 0);
  const from = parse(q.get("desde")) ?? to - 30 * DAY;
  return from < to ? { from, to } : { from: to - 30 * DAY, to };
}

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

function heatmapMini(cells: { dow: number; hour: number; n: number }[]): string {
  const map = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c.n]));
  const max = Math.max(...cells.map((c) => c.n), 1);
  // Solo el horario de comercio típico (10–24) para que quepa.
  const hours = Array.from({ length: 15 }, (_, i) => i + 10);
  const rows = DOW.map((name, dow) => {
    const tds = hours.map((hour) => {
      const n = map.get(`${dow}:${hour}`) ?? 0;
      const bg = n === 0 ? "var(--panel2)" : `color-mix(in srgb, var(--accent) ${Math.round((0.15 + 0.8 * (n / max)) * 100)}%, var(--panel2))`;
      return `<td style="padding:0"><div style="width:12px;height:12px;background:${bg}" title="${name} ${hour}:00 · ${n}"></div></td>`;
    }).join("");
    return `<tr><td style="padding-right:5px;font-size:8px;color:var(--dim);text-align:right">${name}</td>${tds}</tr>`;
  }).join("");
  const labels = hours.map((h) => `<td style="font-size:7px;color:var(--dim);text-align:center">${h % 3 === 0 ? h : ""}</td>`).join("");
  return `<div class="overflow-x-auto"><table style="border-spacing:2px;border-collapse:separate"><tbody>${rows}<tr><td></td>${labels}</tr></tbody></table></div>`;
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

function renderCards(r: RestaurantReports): string {
  const c1 = card(
    "1 · Ventas",
    money(r.ventas.total),
    `${delta(r.ventas.deltaPct)} <span class="text-dim text-[11px]">· ${r.ventas.pedidos} pedidos${r.ventas.cancelados ? ` · ${r.ventas.cancelados} cancelados` : ""}</span>`,
    sparkline(r.ventas.byDay),
    r.ventas.action,
  );

  const c2 = card(
    "2 · Ticket promedio",
    money(r.ticket.avg),
    delta(r.ticket.deltaPct),
    `<div class="text-dim text-[11px]">Antes: ${money(r.ticket.prevAvg)}</div>`,
    r.ticket.action,
  );

  const topMax = Math.max(...r.productos.top.map((p) => p.units), 1);
  const c3 = card(
    "3 · Productos",
    `${r.productos.top.length}`,
    `<span class="text-dim text-[11px]">que rotan · ${r.productos.sinVenta.length} sin venta</span>`,
    barList(r.productos.top.slice(0, 5).map((p) => ({ label: p.name, value: `${p.units} u`, pct: (p.units / topMax) * 100 }))) +
      (r.productos.sinVenta.length
        ? `<div class="text-dim text-[11px]" style="margin-top:6px">Sin venta: ${esc(r.productos.sinVenta.slice(0, 8).join(", "))}${r.productos.sinVenta.length > 8 ? "…" : ""}</div>`
        : ""),
    r.productos.action,
  );

  const c4 = card(
    "4 · Horas y días pico",
    r.pico.topLabel ?? "—",
    `<span class="text-dim text-[11px]">tu franja más cargada</span>`,
    heatmapMini(r.pico.cells),
    r.pico.action,
  );

  const c5 = card(
    "5 · Clientes",
    `${r.clientes.nuevos}`,
    `<span class="text-dim text-[11px]">nuevos · ${r.clientes.recurrentes} recurrentes</span>`,
    barList(
      r.clientes.top.map((cl) => ({
        label: cl.name || cl.phone,
        value: `${money(cl.total)}`,
        pct: (cl.total / Math.max(...r.clientes.top.map((x) => x.total), 1)) * 100,
      })),
    ) +
      (r.clientes.dejaron.length
        ? `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
             <div class="text-bad text-[11.5px]" style="font-weight:600">⚠ Dejaron de pedir (30–60 d): ${r.clientes.dejaron.length} · ${money(r.clientes.dejaronMonto)}</div>
             <div class="text-dim text-[11px]">${esc(r.clientes.dejaron.slice(0, 6).map((d) => d.name || d.phone).join(", "))}</div>
           </div>`
        : ""),
    r.clientes.action,
  );

  const conv = r.salud.conversionPct;
  const c6 = card(
    "6 · Salud del bot",
    conv !== null ? `${conv}%` : "—",
    `<span class="text-dim text-[11px]">conversaciones → pedido</span>`,
    `<div class="text-[12px] text-muted" style="display:flex;flex-direction:column;gap:2px">
       <span>${r.salud.pedidosBot} pedidos por el bot · ${r.salud.pedidosSinHumano} sin intervención</span>
       <span>${r.salud.abandonadas} conversaciones abandonadas</span>
       <span>Costo IA del período: <b class="text-cream">${money(r.salud.costoIA)}</b>${r.salud.costoPorPedido !== null ? ` · ${money(r.salud.costoPorPedido)}/pedido` : ""}</span>
     </div>`,
    r.salud.action,
  );

  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">${c1}${c2}${c3}${c4}${c5}${c6}</div>`;
}

export async function renderReportesRestaurante(env: Env, win: ReportWindow): Promise<string> {
  const r = await buildRestaurantReports(env, win);
  const from = ymd(win.from);
  const to = ymd(win.to - DAY);

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Reportes del restaurante</h2>
        <p class="text-muted text-[12.5px]">Seis números que sirven para decidir. Cada uno termina en una acción, no en un dato.</p>
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
