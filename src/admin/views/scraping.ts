// "Scraping" — registro de cada corrida de scraping (Web Sync / Decodo), sea del
// cron nocturno, del botón manual o del endpoint por token. Muestra el resumen
// (cuántos autos hay, cuántos entraron, salieron o cambiaron) y el detalle de
// cada corrida: autos nuevos (con link), vendidos y cambios campo a campo
// (precio, millas, condición, título, link, desglose). Solo lectura.
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { loadVehicleStore, listStoredVehicles } from "../../kb/inventory";
import {
  WebSyncLogRepo,
  type WebSyncChange,
  type WebSyncRun,
  type WebSyncTrigger,
} from "../../db/webSyncLog";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

function fmtWhen(at: number): string {
  return new Date(at).toLocaleString("es", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ago(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const TRIGGER_LABELS: Record<WebSyncTrigger, string> = {
  cron: "Automático (cron)",
  manual: "Manual (panel)",
  api: "Manual (token)",
  rebuild: "Reconstrucción de KB",
};

function triggerBadge(t: string): string {
  const color = t === "cron" ? "var(--accent2)" : t === "rebuild" ? "var(--dim)" : "var(--muted)";
  return `<span style="font-size:9.5px;letter-spacing:.08em;color:${color};border:1px solid ${color};padding:2px 7px;font-weight:700;white-space:nowrap">${esc(
    (TRIGGER_LABELS as Record<string, string>)[t] ?? t,
  )}</span>`;
}

function num(n: number | undefined, color: string): string {
  const v = n ?? 0;
  return `<span style="font-family:var(--font-mono,monospace);font-size:12.5px;color:${v > 0 ? color : "var(--dim)"}">${v > 0 ? "+" + v.toLocaleString("es") : "0"}</span>`;
}

function ms(d: number | undefined): string {
  if (!d) return "—";
  return d < 1000 ? `${d} ms` : `${(d / 1000).toFixed(1)} s`;
}

export interface ScrapingQuery {
  run?: string;
  trigger?: string;
  before?: number;
  ok?: string;
  err?: string;
}

const PAGE = 40;

export async function renderScraping(env: Env, q: ScrapingQuery = {}): Promise<string> {
  const db = new Db(env.DB);
  const repo = new WebSyncLogRepo(db);

  let runs: WebSyncRun[] = [];
  let total = 0;
  let stats = { runs: 0, added: 0, removed: 0, changed: 0, errors: 0 };
  let currentVehicles = 0;

  try {
    runs = await repo.listRuns({ limit: PAGE + 1, before: q.before, trigger: q.trigger });
    total = await repo.countRuns();
    stats = await repo.stats(Date.now() - 7 * 86_400_000);
    const store = await loadVehicleStore(db);
    currentVehicles = listStoredVehicles(store).length;
  } catch (e) {
    console.warn("[scraping] no se pudo cargar el registro:", e);
  }

  const hasMore = runs.length > PAGE;
  if (hasMore) runs = runs.slice(0, PAGE);
  const oldestAt = runs.length ? runs[runs.length - 1].at : undefined;

  const selectedId = q.run ?? runs[0]?.id;
  let selected: WebSyncRun | null = runs.find((r) => r.id === selectedId) ?? null;
  if (!selected && selectedId) selected = await repo.getRun(selectedId).catch(() => null);
  let changes: WebSyncChange[] = [];
  if (selected) changes = await repo.listChanges(selected.id).catch(() => [] as WebSyncChange[]);

  const qs = (extra: Record<string, string | number | undefined>): string => {
    const p = new URLSearchParams();
    if (q.trigger) p.set("trigger", q.trigger);
    if (q.run) p.set("run", q.run);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const flash = q.ok
    ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px">${esc(q.ok)}</div>`
    : q.err
      ? `<div style="border:1px solid var(--bad);background:var(--bad-soft);color:var(--bad);padding:10px 14px;font-size:12.5px">${esc(q.err)}</div>`
      : "";

  const kpi = (label: string, value: string, sub: string, color = "var(--cream)") => `
    <div class="bg-panel border" style="padding:13px 15px;display:flex;flex-direction:column;gap:2px;min-width:130px;flex:1">
      <span class="text-[10.5px]" style="color:var(--dim);letter-spacing:.08em;text-transform:uppercase">${esc(label)}</span>
      <span class="font-display font-semibold" style="font-size:21px;color:${color}">${esc(value)}</span>
      <span class="text-[11px]" style="color:var(--muted)">${esc(sub)}</span>
    </div>`;

  const lastAt = runs[0]?.at;
  const kpis = `
    <div class="xscroll" style="display:flex;gap:10px;flex-wrap:wrap">
      ${kpi("Autos en inventario", currentVehicles.toLocaleString("es"), "lo que sabe el bot ahora")}
      ${kpi("Última corrida", lastAt ? ago(lastAt) : "—", lastAt ? fmtWhen(lastAt) : "sin corridas")}
      ${kpi("Nuevos (7 días)", stats.added.toLocaleString("es"), `${stats.runs} corrida(s)`, "var(--ok)")}
      ${kpi("Vendidos/salieron (7 d)", stats.removed.toLocaleString("es"), "ya no están en el feed", "var(--warn)")}
      ${kpi("Cambios (7 días)", stats.changed.toLocaleString("es"), "precio, millas, etc.", "var(--accent2)")}
    </div>`;

  const triggerOptions = ["", "cron", "manual", "api", "rebuild"]
    .map(
      (t) =>
        `<option value="${t}"${q.trigger === t ? " selected" : ""}>${t === "" ? "Todos los disparadores" : esc((TRIGGER_LABELS as Record<string, string>)[t] ?? t)}</option>`,
    )
    .join("");

  const toolbar = `
    <form method="GET" action="/admin/scraping" class="xscroll"
          style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);padding:12px 14px">
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="text-[10.5px]" style="color:var(--dim);letter-spacing:.08em;text-transform:uppercase">Disparador</span>
        <select name="trigger" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 10px;font-size:12px;outline:none">${triggerOptions}</select>
      </label>
      ${q.run ? `<input type="hidden" name="run" value="${esc(q.run)}">` : ""}
      <button type="submit" class="text-[12px] font-display font-semibold"
              style="border:1px solid var(--line);color:var(--cream);padding:8px 14px;cursor:pointer;background:none">Filtrar</button>
      ${
        q.trigger
          ? `<a href="/admin/scraping" class="text-[11.5px]" style="color:var(--dim);padding:8px 4px">limpiar</a>`
          : ""
      }
      <a href="/admin/scraping/export.csv${qs({})}" class="text-[11.5px] font-display font-semibold"
         style="border:1px solid var(--line);color:var(--cream);padding:8px 12px;text-decoration:none">Exportar CSV</a>
      <button type="submit" formmethod="POST" formaction="/admin/scraping/run" class="text-[12px] font-display font-semibold"
              style="margin-left:auto;border:1px solid var(--accent);color:var(--accent);background:none;padding:8px 15px;cursor:pointer">Scrapear ahora</button>
    </form>`;

  const th = (t: string, extra = "") =>
    `<th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--line);white-space:nowrap;${extra}">${t}</th>`;

  const runRows = runs.length
    ? runs
        .map((r) => {
          const isSel = r.id === selectedId;
          const err = r.errors > 0 ? `<span style="color:var(--bad)">${r.errors}</span>` : `<span style="color:var(--dim)">0</span>`;
          return `<tr style="border-bottom:1px solid var(--line);${isSel ? "background:var(--panel2)" : ""}">
            <td style="padding:9px;vertical-align:top"><span class="font-mono text-[10.5px]" style="color:var(--dim);white-space:nowrap">${esc(fmtWhen(r.at))}</span></td>
            <td style="padding:9px;vertical-align:top">${triggerBadge(r.trigger)}</td>
            <td style="padding:9px;vertical-align:top"><span class="font-mono text-[12px] text-cream">${r.vehiclesTotal.toLocaleString("es")}</span></td>
            <td style="padding:9px;vertical-align:top">${num(r.added, "var(--ok)")}</td>
            <td style="padding:9px;vertical-align:top">${num(r.removed, "var(--warn)")}</td>
            <td style="padding:9px;vertical-align:top">${num(r.changed, "var(--accent2)")}</td>
            <td style="padding:9px;vertical-align:top"><span class="font-mono text-[11.5px]">${err}</span></td>
            <td style="padding:9px;vertical-align:top"><span class="font-mono text-[11px]" style="color:var(--muted)">${esc(ms(r.durationMs))}</span></td>
            <td style="padding:9px;vertical-align:top">
              <a href="/admin/scraping${qs({ run: r.id })}" class="text-[11.5px]" style="color:${isSel ? "var(--accent)" : "var(--muted)"}">${isSel ? "viendo" : "ver"}</a>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="9" style="text-align:center;color:var(--dim);padding:30px;font-size:13px">
         Todavía no hay corridas registradas. Se registran solas: el cron nocturno y cada vez que uses “Scrapear ahora” o “Sincronizar sitio ahora”.
       </td></tr>`;

  const runTable = `
    <div class="bg-panel border xscroll" style="padding:6px 8px">
      <table style="width:100%;min-width:860px;border-collapse:collapse">
        <thead><tr>${th("Cuándo")}${th("Disparador")}${th("Autos")}${th("Nuevos")}${th("Salieron")}${th("Cambios")}${th("Errores")}${th("Duración")}${th("")}</tr></thead>
        <tbody>${runRows}</tbody>
      </table>
    </div>`;

  // ── Detalle de la corrida seleccionada ─────────────────────────────────────
  const added = changes.filter((c) => c.kind === "added");
  const removed = changes.filter((c) => c.kind === "removed");
  const changedRows = changes.filter((c) => c.kind === "changed");

  const carLink = (c: WebSyncChange, label: string) =>
    c.url
      ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" style="color:var(--cream);text-decoration:none">${esc(label)}</a>`
      : `<span style="color:var(--cream)">${esc(label)}</span>`;

  const listBlock = (title: string, color: string, items: string[], emptyText: string) => `
    <div class="bg-panel border" style="padding:12px 14px;flex:1;min-width:260px">
      <h4 class="font-display font-semibold text-[12.5px]" style="color:${color};margin:0 0 8px">${esc(title)} <span style="color:var(--dim);font-weight:400">(${items.length})</span></h4>
      ${
        items.length
          ? `<div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow:auto">${items.join("")}</div>`
          : `<p class="text-[11.5px]" style="color:var(--dim);margin:0">${esc(emptyText)}</p>`
      }
    </div>`;

  const addedItems = added.map(
    (c) =>
      `<div style="font-size:12px;border-left:2px solid var(--ok);padding-left:8px">
         ${carLink(c, c.title ?? "Auto")}
         ${c.vin ? `<span class="font-mono text-[10px]" style="color:var(--dim);display:block">VIN ${esc(c.vin)}</span>` : ""}
       </div>`,
  );
  const removedItems = removed.map(
    (c) =>
      `<div style="font-size:12px;border-left:2px solid var(--warn);padding-left:8px">
         <span style="color:var(--muted);text-decoration:line-through">${esc(c.title ?? "Auto")}</span>
         ${c.vin ? `<span class="font-mono text-[10px]" style="color:var(--dim);display:block">VIN ${esc(c.vin)}</span>` : ""}
       </div>`,
  );

  // Agrupar los cambios por auto (varias filas = varios campos del mismo auto).
  const changedByVehicle = new Map<string, { title: string; url?: string; vin?: string; fields: WebSyncChange[] }>();
  for (const c of changedRows) {
    const k = c.vehicleKey ?? c.title ?? c.id;
    const g = changedByVehicle.get(k) ?? { title: c.title ?? "Auto", url: c.url, vin: c.vin, fields: [] };
    g.fields.push(c);
    changedByVehicle.set(k, g);
  }
  const changedItems = [...changedByVehicle.values()].map((g) => {
    const fields = g.fields
      .map(
        (f) => `<div class="font-mono text-[10.5px]" style="color:var(--muted)">
            <span style="color:var(--dim)">${esc(f.field ?? "")}:</span>
            <span style="color:var(--dim);text-decoration:line-through">${esc(f.oldValue ?? "(vacío)")}</span>
            → <span style="color:var(--accent2)">${esc(f.newValue ?? "(vacío)")}</span>
          </div>`,
      )
      .join("");
    return `<div style="font-size:12px;border-left:2px solid var(--accent2);padding-left:8px;display:flex;flex-direction:column;gap:2px">
        ${g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener" style="color:var(--cream);text-decoration:none">${esc(g.title)}</a>` : `<span style="color:var(--cream)">${esc(g.title)}</span>`}
        ${fields}
      </div>`;
  });

  const detail = selected
    ? `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <h3 class="font-display font-semibold text-[14px] text-cream">Detalle de la corrida</h3>
        <span class="font-mono text-[11px]" style="color:var(--dim)">${esc(fmtWhen(selected.at))} · ${esc((TRIGGER_LABELS as Record<string, string>)[selected.trigger] ?? selected.trigger)} · ${selected.vehiclesTotal.toLocaleString("es")} autos · ${esc(ms(selected.durationMs))}</span>
      </div>
      ${selected.url ? `<p class="font-mono text-[10.5px]" style="color:var(--dim);margin:0;word-break:break-all">${esc(selected.url)}</p>` : ""}
      ${selected.note ? `<p class="text-[11.5px]" style="color:var(--muted);margin:0">${esc(selected.note)}</p>` : ""}
      ${
        selected.errorMsg
          ? `<div style="border:1px solid var(--bad);background:var(--bad-soft);color:var(--bad);padding:9px 12px;font-size:11.5px;word-break:break-word">Error: ${esc(selected.errorMsg)}</div>`
          : ""
      }
      ${
        !selected.errorMsg && changes.length === 0
          ? `<p class="text-[12px]" style="color:var(--muted);margin:0">Sin cambios: el inventario quedó igual que la corrida anterior${selected.trigger === "rebuild" ? " (la reconstrucción de KB no scrapea el feed)" : ""}.</p>`
          : `<div style="display:flex;gap:10px;flex-wrap:wrap">
               ${listBlock("Nuevos", "var(--ok)", addedItems, "Ninguno.")}
               ${listBlock("Salieron / vendidos", "var(--warn)", removedItems, "Ninguno.")}
               ${listBlock("Cambios", "var(--accent2)", changedItems, "Ninguno.")}
             </div>`
      }
    </div>`
    : "";

  const more =
    hasMore && oldestAt
      ? `<div style="text-align:center;margin-top:6px">
           <a href="/admin/scraping${qs({ before: oldestAt })}" class="text-[12px] font-display font-semibold"
              style="border:1px solid var(--line);color:var(--cream);padding:9px 18px;text-decoration:none">Cargar más antiguas</a>
         </div>`
      : "";

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Registro de scraping</h2>
        <p class="text-muted text-[12.5px]">
          Qué pasó en cada corrida de <b>Decodo</b> (Web Sync / inventario): cuántos autos hay, cuáles son
          <b>nuevos</b>, cuáles <b>salieron</b> y qué <b>cambió</b> (precio, millas, condición, título, link). Se registra
          solo, en el cron nocturno y cada vez que scrapeás a mano. Se conserva 90 días · ${total.toLocaleString("es")} corridas.
        </p>
      </div>
      ${flash}
      ${kpis}
      ${toolbar}
      ${runTable}
      ${more}
      ${detail}
    </div>`;

  return layout({ title: "Scraping", activeTab: "scraping", body, env });
}

/** CSV del resumen de corridas (respeta el filtro — tope 500). */
export async function exportScrapingCsv(env: Env, q: ScrapingQuery = {}): Promise<string> {
  const repo = new WebSyncLogRepo(new Db(env.DB));
  const rows = await repo.listRuns({ before: q.before, trigger: q.trigger, limit: 500 }).catch(() => [] as WebSyncRun[]);
  const head = [
    "fecha",
    "disparador",
    "autos",
    "nuevos",
    "salieron",
    "cambios",
    "errores",
    "duracion_ms",
    "url",
    "nota",
    "error",
  ];
  const cell = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push(
      [
        new Date(r.at).toISOString(),
        r.trigger,
        r.vehiclesTotal,
        r.added,
        r.removed,
        r.changed,
        r.errors,
        r.durationMs ?? "",
        r.url ?? "",
        r.note ?? "",
        r.errorMsg ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n");
}
