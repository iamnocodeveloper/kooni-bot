// "Inventario sincronizado" — todos los autos que el bot tiene cargados, con
// búsqueda, filtros y paginación. Antes la pestaña Scraping solo mostraba el
// diff de la corrida: no había forma de ver el inventario completo (por eso
// "muchos resultados no se ven").
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { loadVehicleStore, listStoredVehicles, filterStoredVehicles, paginate, lacksPhoto, type StoreFilter } from "../../kb/inventory";
import { panelI18n } from "../i18n";
import { emptyState, alertBox, pill as uiPill } from "./ui";
import { getNiche } from "../../niches";
import { vehicleCsvHeader } from "../../kb/vehiclesCsv";

const PAGE_SIZE = 50;
const FILTERS: StoreFilter[] = ["all", "sinprecio", "sinfoto", "nuevo", "usado"];

export interface InventarioQuery {
  q?: string;
  f?: string;
  page?: number;
  /** Mensaje de la última acción (importar CSV), viene por `?flash=`. */
  flash?: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function money(n: number | null): string {
  return n === null ? "—" : `$${n.toLocaleString("en-US")}`;
}

export async function renderInventario(env: Env, q: InventarioQuery = {}): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);

  let all: ReturnType<typeof listStoredVehicles> = [];
  try {
    all = listStoredVehicles(await loadVehicleStore(db));
  } catch (e) {
    console.warn("[inventario] no se pudo leer el store:", e);
  }

  const noPrice = all.filter((v) => v.price === null).length;
  const noPhoto = all.filter(lacksPhoto).length;

  const f = (FILTERS as string[]).includes(q.f ?? "") ? (q.f as StoreFilter) : "all";
  const filtered = filterStoredVehicles(all, { q: q.q, f });
  const { items, page, pages } = paginate(filtered, q.page ?? 1, PAGE_SIZE);

  const link = (extra: Record<string, string | number | undefined>): string => {
    const p = new URLSearchParams();
    if (q.q) p.set("q", q.q);
    if (f !== "all") p.set("f", f);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return `/admin/scraping/inventario${s ? `?${s}` : ""}`;
  };

  const kpi = (label: string, value: number | string, color = "var(--cream)") => `
    <div class="bg-panel border" style="padding:11px 14px;min-width:120px;flex:1">
      <div class="text-[10.5px]" style="color:var(--dim);letter-spacing:.08em;text-transform:uppercase">${esc(label)}</div>
      <div class="font-display font-semibold" style="font-size:19px;color:${color}">${esc(String(value))}</div>
    </div>`;

  const pill = (key: string, label: string, n: number) => {
    const active = f === key;
    const color = active ? "var(--accent)" : "var(--muted)";
    return `<a href="${link({ f: key === "all" ? undefined : key })}" style="font-size:11px;color:${color};border:1px solid ${color};padding:3px 9px;text-decoration:none">${esc(label)} ${n}</a>`;
  };

  const rows = items
    .map((v) => {
      const photo = v.imgStatus === "ok" && v.imageUrl
        ? `<img src="${esc(v.imageUrl)}" alt="" loading="lazy" style="width:56px;height:42px;object-fit:cover;border:1px solid var(--line);border-radius:6px">`
        : `<div style="width:56px;height:42px;border:1px dashed var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--dim)"><i data-lucide="${v.imgStatus === "error" ? "image-off" : "image"}" width="14" height="14"></i></div>`;
      const status =
        v.imgStatus === "ok" && v.imageUrl ? uiPill(t("inv.photo.ok"), "ok")
          : v.imgStatus === "error" ? uiPill(t("inv.photo.error"), "bad")
            : uiPill(t("inv.photo.pending"), "dim");
      return `<tr style="border-bottom:1px solid var(--line)">
        <td style="padding:8px 9px">${photo}</td>
        <td style="padding:8px 9px">
          <div style="color:var(--cream);font-size:12.5px">${esc(v.title)}</div>
          ${v.vin ? `<div class="font-mono" style="font-size:10px;color:var(--dim)">VIN ${esc(v.vin)}</div>` : ""}
        </td>
        <td style="padding:8px 9px;color:var(--muted);font-size:12px">${esc(v.condition ?? "—")}</td>
        <td style="padding:8px 9px" class="font-mono"><span style="font-size:12px;color:${v.price === null ? "var(--dim)" : "var(--cream)"}">${esc(money(v.price))}</span></td>
        <td style="padding:8px 9px" class="font-mono"><span style="font-size:12px;color:var(--muted)">${v.miles === null ? "—" : esc(v.miles.toLocaleString("en-US"))}</span></td>
        <td style="padding:8px 9px">${status}</td>
        <td style="padding:8px 9px">${v.listingUrl ? `<a href="${esc(v.listingUrl)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:11.5px;text-decoration:none">${esc(t("inv.open"))}</a>` : ""}</td>
      </tr>`;
    })
    .join("");

  const table = items.length
    ? `<div class="tblwrap"><table style="width:100%;min-width:760px;border-collapse:collapse">
         <thead><tr>
           <th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;border-bottom:1px solid var(--line)">${esc(t("inv.col.photo"))}</th>
           <th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;border-bottom:1px solid var(--line)">${esc(t("inv.col.car"))}</th>
           <th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;border-bottom:1px solid var(--line)">${esc(t("inv.col.condition"))}</th>
           <th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;border-bottom:1px solid var(--line)">${esc(t("inv.col.price"))}</th>
           <th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;border-bottom:1px solid var(--line)">${esc(t("inv.col.miles"))}</th>
           <th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;border-bottom:1px solid var(--line)">${esc(t("inv.col.status"))}</th>
           <th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;border-bottom:1px solid var(--line)"></th>
         </tr></thead>
         <tbody>${rows}</tbody>
       </table></div>`
    : emptyState(esc(all.length ? t("inv.empty") : t("inv.empty.none")), "car");

  const pager = pages > 1
    ? `<div style="display:flex;align-items:center;gap:10px;justify-content:center">
         ${page > 1 ? `<a class="ghostbtn" style="font-size:11.5px;padding:6px 12px;text-decoration:none" href="${link({ page: page - 1 })}">${esc(t("inv.page.prev"))}</a>` : ""}
         <span class="font-mono" style="font-size:11.5px;color:var(--dim)">${esc(t("inv.page.info", { page, pages }))}</span>
         ${page < pages ? `<a class="ghostbtn" style="font-size:11.5px;padding:6px 12px;text-decoration:none" href="${link({ page: page + 1 })}">${esc(t("inv.page.next"))}</a>` : ""}
       </div>`
    : "";

  const importForm = `
    <form id="importar" method="POST" action="/admin/scraping/inventario/import" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
      <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em">${esc(t("inv.import.title"))}</div>
      <div class="text-dim text-[11px]" style="line-height:1.55">${esc(t("inv.import.help"))}</div>
      <div class="text-dim text-[11px]">${esc(t("inv.import.headerLabel"))} <span class="font-mono" style="color:var(--muted);word-break:break-all">${esc(vehicleCsvHeader())}</span></div>
      <textarea name="csv" rows="8" placeholder="${esc(t("inv.import.placeholder"))}"
        style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:9px 11px;font-size:12px;resize:vertical;font-family:monospace"></textarea>
      <label class="text-dim text-[11px]" style="display:flex;gap:6px;align-items:center;cursor:pointer">
        <input type="checkbox" name="replace" value="1"> ${esc(t("inv.import.replace"))}
      </label>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label class="ghostbtn" style="font-size:11.5px;padding:7px 12px;cursor:pointer;border:1px solid var(--line);background:var(--panel2);color:var(--muted);display:inline-flex;align-items:center;gap:6px">
          <i data-lucide="paperclip" width="13" height="13"></i> ${esc(t("inv.import.file"))}
          <input type="file" id="csvfile" accept=".csv,.tsv,.txt" style="display:none">
        </label>
        <button type="submit" class="font-display font-semibold text-[12px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 16px;border-radius:9px">${esc(t("inv.import.submit"))}</button>
      </div>
    </form>
    <script>
      // Vuelca el archivo elegido dentro del textarea: el server solo lee el
      // campo "csv" del form, asi no hace falta multipart ni endpoint aparte.
      (function(){
        var input = document.getElementById("csvfile");
        if (!input) return;
        input.addEventListener("change", function(){
          var file = input.files && input.files[0];
          if (!file) return;
          var ta = document.querySelector('textarea[name="csv"]');
          if (!ta) return;
          var reader = new FileReader();
          reader.onload = function(){ ta.value = String(reader.result || ""); };
          reader.readAsText(file);
        });
      })();
    </script>`;

  const flashBox = q.flash ? alertBox(esc(q.flash), q.flash.startsWith("✓") ? "ok" : "bad") : "";

  const body = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <a href="/admin/scraping" style="font-size:11.5px;color:var(--dim);text-decoration:none">${esc(t("inv.back"))}</a>
        <h2 class="font-display font-semibold text-[15px] text-cream">${esc(t("inv.title"))}</h2>
        <p class="text-muted text-[12.5px]">${esc(t("inv.subtitle", { total: all.length }))}</p>
      </div>

      <div class="xscroll" style="display:flex;gap:10px;flex-wrap:wrap">
        ${kpi(t("inv.kpi.total"), all.length)}
        ${kpi(t("inv.kpi.noPrice"), noPrice, noPrice > 0 ? "var(--warn)" : "var(--ok)")}
        ${kpi(t("inv.kpi.noPhoto"), noPhoto, noPhoto > 0 ? "var(--warn)" : "var(--ok)")}
      </div>

      <div class="xscroll" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);padding:11px 13px">
        ${pill("all", t("inv.filter.all"), all.length)}
        ${pill("sinprecio", t("inv.filter.noPrice"), noPrice)}
        ${pill("sinfoto", t("inv.filter.noPhoto"), noPhoto)}
        ${pill("nuevo", t("inv.filter.new"), all.filter((v) => (v.condition ?? "").toLowerCase() === "nuevo").length)}
        ${pill("usado", t("inv.filter.used"), all.filter((v) => /usado|certificado/.test((v.condition ?? "").toLowerCase())).length)}
        <form method="GET" action="/admin/scraping/inventario" style="margin-left:auto;display:flex;gap:6px">
          ${f !== "all" ? `<input type="hidden" name="f" value="${esc(f)}">` : ""}
          <input name="q" value="${esc(q.q ?? "")}" placeholder="${esc(t("inv.search.placeholder"))}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);font-size:12px;padding:6px 10px;border-radius:8px;min-width:210px">
          <button class="ghostbtn" style="font-size:12px;padding:6px 12px">${esc(t("inv.search.submit"))}</button>
        </form>
      </div>

      ${flashBox}
      ${table}
      ${pager}

      ${importForm}
    </div>`;

  // El giro concesionario trae el Inventario en su menú (navExtra id "inventario").
  const activeTab = getNiche(env).hooks?.navExtra?.some((e) => e.id === "inventario") ? "inventario" : "scraping";
  return layout({ title: t("inv.title"), activeTab, body, env });
}
