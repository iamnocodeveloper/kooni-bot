// "Propiedades" — el inventario del giro inmobiliaria: TODAS las propiedades que
// el bot tiene cargadas, con KPIs, búsqueda, filtros y paginación. Es el gemelo
// de `inventario.ts` (los autos) y suma las dos puertas de entrada del giro:
//   - Importar un CSV/TSV: se puede pegar en el textarea o elegir un archivo —
//     el `<script>` inline lo vuelca con FileReader, así el server no necesita
//     multipart (`routes.ts` solo lee `formData().get("csv")`).
//   - Leer el sitio de la inmobiliaria con el proveedor de scraping configurado.
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import {
  loadPropiedadStoreFromDb,
  listStoredPropiedades,
  filterStoredPropiedades,
  paginate,
  lacksPhoto,
  type PropiedadStoreFilter,
  type StoredPropiedad,
} from "../../kb/properties";
import { csvHeader } from "../../kb/propertiesCsv";
import { panelI18n } from "../i18n";
import { emptyState, alertBox, pill as uiPill } from "./ui";

const PAGE_SIZE = 50;
const FILTERS: PropiedadStoreFilter[] = ["all", "venta", "renta", "sinprecio", "sinfoto"];

export interface PropiedadesQuery {
  q?: string;
  f?: string;
  page?: number;
  flash?: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Precio con su moneda; "—" si no hay precio (no se inventa). */
function money(n: number | null, moneda: string | null): string {
  if (n === null) return "—";
  const sign = moneda === "USD" ? "US$" : "$";
  return `${sign}${n.toLocaleString("es-MX")}`;
}

function numOr(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("es-MX");
}

/** Color del chip de estatus (valores del store: disponible/apartado/vendido/rentado). */
function estatusKind(estatus: string | null): "ok" | "warn" | "dim" {
  if (estatus === "disponible") return "ok";
  if (estatus === "apartado") return "warn";
  return "dim";
}

export async function renderPropiedades(env: Env, opts: PropiedadesQuery = {}): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);

  let all: StoredPropiedad[] = [];
  try {
    all = listStoredPropiedades(await loadPropiedadStoreFromDb(db));
  } catch (e) {
    console.warn("[propiedades] no se pudo leer el store:", e);
  }

  const venta = all.filter((p) => p.operacion === "venta").length;
  const renta = all.filter((p) => p.operacion === "renta").length;
  const noPrice = all.filter((p) => p.precio === null).length;
  const noPhoto = all.filter(lacksPhoto).length;

  const f = (FILTERS as string[]).includes(opts.f ?? "") ? (opts.f as PropiedadStoreFilter) : "all";
  const filtered = filterStoredPropiedades(all, { q: opts.q, f });
  const { items, page, pages } = paginate(filtered, opts.page ?? 1, PAGE_SIZE);

  const link = (extra: Record<string, string | number | undefined>): string => {
    const p = new URLSearchParams();
    if (opts.q) p.set("q", opts.q);
    if (f !== "all") p.set("f", f);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return `/admin/propiedades${s ? `?${s}` : ""}`;
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

  const th = (label: string) =>
    `<th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;border-bottom:1px solid var(--line);white-space:nowrap">${esc(label)}</th>`;

  const rows = items
    .map((p) => {
      const photo = p.imageUrl
        ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy" title="${esc(t("props.photo.ok"))}" style="width:56px;height:42px;object-fit:cover;border:1px solid var(--line);border-radius:6px">`
        : `<div title="${esc(p.imgStatus === "error" ? t("props.photo.error") : t("props.photo.pending"))}" style="width:56px;height:42px;border:1px dashed var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--dim)"><i data-lucide="${p.imgStatus === "error" ? "image-off" : "image"}" width="14" height="14"></i></div>`;
      return `<tr class="datarow" style="border-bottom:1px solid var(--line)">
        <td style="padding:8px 9px" class="font-mono"><span style="font-size:11.5px;color:var(--muted)">${esc(p.codigo ?? "—")}</span></td>
        <td style="padding:8px 9px"><div style="color:var(--cream);font-size:12.5px">${esc(p.title)}</div></td>
        <td style="padding:8px 9px;color:var(--muted);font-size:12px">${esc(p.operacion ?? "—")}</td>
        <td style="padding:8px 9px;color:var(--muted);font-size:12px">${esc(p.tipo ?? "—")}</td>
        <td style="padding:8px 9px;color:var(--muted);font-size:12px">${esc(p.zona ?? "—")}</td>
        <td style="padding:8px 9px" class="font-mono"><span style="font-size:12px;color:${p.precio === null ? "var(--dim)" : "var(--cream)"}">${esc(money(p.precio, p.moneda))}</span></td>
        <td style="padding:8px 9px" class="font-mono"><span style="font-size:12px;color:var(--muted)">${esc(numOr(p.recamaras))}</span></td>
        <td style="padding:8px 9px" class="font-mono"><span style="font-size:12px;color:var(--muted)">${esc(numOr(p.banos))}</span></td>
        <td style="padding:8px 9px" class="font-mono"><span style="font-size:12px;color:var(--muted)">${esc(numOr(p.m2))}</span></td>
        <td style="padding:8px 9px">${p.estatus ? uiPill(esc(p.estatus), estatusKind(p.estatus)) : uiPill("—", "dim")}</td>
        <td style="padding:8px 9px">${photo}</td>
        <td style="padding:8px 9px">${p.listingUrl ? `<a href="${esc(p.listingUrl)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:11.5px;text-decoration:none">${esc(t("props.open"))}</a>` : ""}</td>
      </tr>`;
    })
    .join("");

  const table = items.length
    ? `<div class="tblwrap"><table style="width:100%;min-width:1080px;border-collapse:collapse">
         <thead><tr>
           ${th(t("props.col.ref"))}
           ${th(t("props.col.title"))}
           ${th(t("props.col.operacion"))}
           ${th(t("props.col.tipo"))}
           ${th(t("props.col.zona"))}
           ${th(t("props.col.precio"))}
           ${th(t("props.col.recamaras"))}
           ${th(t("props.col.banos"))}
           ${th(t("props.col.m2"))}
           ${th(t("props.col.estatus"))}
           ${th(t("props.col.foto"))}
           ${th(t("props.col.link"))}
         </tr></thead>
         <tbody>${rows}</tbody>
       </table></div>`
    : all.length
      ? emptyState(esc(t("props.empty.filter")), "filter")
      : emptyState(
          `${esc(t("props.empty"))}<div style="margin-top:6px"><a href="#importar" style="color:var(--accent);font-size:12px;text-decoration:none">${esc(t("props.import.title"))} ↓</a></div>`,
          "house",
        );

  const pager = pages > 1
    ? `<div style="display:flex;align-items:center;gap:10px;justify-content:center">
         ${page > 1 ? `<a class="ghostbtn" style="font-size:11.5px;padding:6px 12px;text-decoration:none" href="${link({ page: page - 1 })}">${esc(t("props.page.prev"))}</a>` : ""}
         <span class="font-mono" style="font-size:11.5px;color:var(--dim)">${esc(t("props.page.info", { page, pages }))}</span>
         ${page < pages ? `<a class="ghostbtn" style="font-size:11.5px;padding:6px 12px;text-decoration:none" href="${link({ page: page + 1 })}">${esc(t("props.page.next"))}</a>` : ""}
       </div>`
    : "";

  const importForm = `
    <form id="importar" method="POST" action="/admin/propiedades/import" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
      <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em">${esc(t("props.import.title"))}</div>
      <div class="text-dim text-[11px]" style="line-height:1.55">${esc(t("props.import.help"))}</div>
      <div class="text-dim text-[11px]">${esc(t("props.import.headerLabel"))} <span class="font-mono" style="color:var(--muted);word-break:break-all">${esc(csvHeader())}</span></div>
      <textarea name="csv" rows="8" placeholder="${esc(t("props.import.placeholder"))}"
        style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:9px 11px;font-size:12px;resize:vertical;font-family:monospace"></textarea>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label class="ghostbtn" style="font-size:11.5px;padding:7px 12px;cursor:pointer;border:1px solid var(--line);background:var(--panel2);color:var(--muted);display:inline-flex;align-items:center;gap:6px">
          <i data-lucide="paperclip" width="13" height="13"></i> ${esc(t("props.import.file"))}
          <input type="file" id="csvfile" accept=".csv,.tsv,.txt" style="display:none">
        </label>
        <button type="submit" class="font-display font-semibold text-[12px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 16px;border-radius:9px">${esc(t("props.import.submit"))}</button>
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

  const syncForm = `
    <form method="POST" action="/admin/propiedades/sync" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
      <div class="text-dim text-[10px] font-mono" style="letter-spacing:.12em">${esc(t("props.sync.title"))}</div>
      <div class="text-dim text-[11px]" style="line-height:1.55">${esc(t("props.sync.help"))}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input name="site" placeholder="${esc(t("props.sync.sitePlaceholder"))}"
          style="flex:1;min-width:230px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px;border-radius:8px">
        <button type="submit" class="font-display font-semibold text-[12px] cursor-pointer" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 16px;border-radius:9px">${esc(t("props.sync.submit"))}</button>
      </div>
    </form>`;

  const flashBox = opts.flash
    ? alertBox(esc(opts.flash), opts.flash.startsWith("✓") ? "ok" : "bad")
    : "";

  const body = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${esc(t("props.title"))}</h2>
        <p class="text-muted text-[12.5px]">${esc(t("props.subtitle", { total: all.length }))}</p>
      </div>

      <div class="xscroll" style="display:flex;gap:10px;flex-wrap:wrap">
        ${kpi(t("props.kpi.total"), all.length)}
        ${kpi(t("props.kpi.venta"), venta)}
        ${kpi(t("props.kpi.renta"), renta)}
        ${kpi(t("props.kpi.noPrice"), noPrice, noPrice > 0 ? "var(--warn)" : "var(--ok)")}
        ${kpi(t("props.kpi.noPhoto"), noPhoto, noPhoto > 0 ? "var(--warn)" : "var(--ok)")}
      </div>

      <div class="xscroll" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);padding:11px 13px">
        ${pill("all", t("props.filter.all"), all.length)}
        ${pill("venta", t("props.filter.venta"), venta)}
        ${pill("renta", t("props.filter.renta"), renta)}
        ${pill("sinprecio", t("props.filter.noPrice"), noPrice)}
        ${pill("sinfoto", t("props.filter.noPhoto"), noPhoto)}
        <form method="GET" action="/admin/propiedades" style="margin-left:auto;display:flex;gap:6px">
          ${f !== "all" ? `<input type="hidden" name="f" value="${esc(f)}">` : ""}
          <input name="q" value="${esc(opts.q ?? "")}" placeholder="${esc(t("props.search.placeholder"))}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);font-size:12px;padding:6px 10px;border-radius:8px;min-width:210px">
          <button class="ghostbtn" style="font-size:12px;padding:6px 12px">${esc(t("props.search.submit"))}</button>
        </form>
      </div>

      ${flashBox}
      ${table}
      ${pager}

      ${importForm}
      ${syncForm}
    </div>`;

  return layout({ title: t("props.title"), activeTab: "propiedades", body, env });
}
