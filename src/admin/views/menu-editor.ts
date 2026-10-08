// Vista "Menú" del nicho RESTAURANTE. CRUD de productos (tabla `products`).
// Lo usa la tool tomarPedido (reconciliar precios), catalogQuery y —más
// adelante— el menú web público. Sin categoría = "Sin categoría".
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { ProductsRepo, type Product } from "../../db/products";
import { getNiche } from "../../niches";
import { panelI18n, type T } from "../i18n";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const money = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
};

function row(t: T, p: Product): string {
  const off = p.active === 0;
  return `<div class="border border-line" style="padding:11px 13px;display:flex;flex-direction:column;gap:8px;${off ? "opacity:.55" : ""}">
    <form method="POST" action="/admin/menu/${p.id}" style="display:flex;flex-direction:column;gap:7px">
      <div style="display:grid;grid-template-columns:1fr 90px 120px auto;gap:8px;align-items:center">
        <input name="name" value="${esc(p.name)}" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        <input name="price" type="number" step="0.01" min="0" value="${p.price}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        <input name="category" value="${esc(p.category ?? "")}" placeholder="${t("med.cat.placeholder")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">${t("common.save")}</button>
      </div>
      <input name="description" value="${esc(p.description ?? "")}" placeholder="${t("med.desc.placeholder")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px;width:100%">
    </form>
    <div style="display:flex;gap:6px;align-items:center">
      <form method="POST" action="/admin/menu/${p.id}/toggle" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--line);color:${off ? "var(--ok)" : "var(--warn)"};padding:5px 10px;font-size:11.5px;cursor:pointer">${off ? t("med.activate") : t("med.markSoldout")}</button>
      </form>
      <form method="POST" action="/admin/menu/${p.id}/delete" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:5px 10px;font-size:11.5px;cursor:pointer">${t("med.delete")}</button>
      </form>
      ${off ? `<span class="text-warn text-[11px]">${t("med.soldoutNote")}</span>` : ""}
    </div>
  </div>`;
}

export async function renderMenu(env: Env, saved = false): Promise<string> {
  const { t } = await panelI18n(env);
  const niche = getNiche(env);
  const title = niche.id === "restaurante" ? t("med.title") : "Catálogo de precios";
  const products = await new ProductsRepo(new Db(env.DB)).all();
  const byCat = new Map<string, Product[]>();
  for (const p of products) {
    const k = p.category?.trim() || t("med.noCategory");
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(p);
  }

  const groups = [...byCat.entries()]
    .map(
      ([cat, list]) => `<div style="display:flex;flex-direction:column;gap:8px">
        <h3 class="font-display font-semibold text-[13px] text-cream">${esc(cat)} <span class="text-dim text-[11px]">· ${list.length}</span></h3>
        ${list.map((p) => row(t, p)).join("")}
      </div>`,
    )
    .join("");

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${esc(title)}</h2>
        <p class="text-muted text-[12.5px]">${t("med.subtitle")}</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">${t("med.saved")}</div>` : ""}

      ${
        niche.seedCatalog?.length && products.length === 0
          ? `<form method="POST" action="/admin/menu/seed" class="bg-panel border border-linelit" style="padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span class="text-muted" style="font-size:12.5px;flex:1">¿Arrancamos con paquetes de ejemplo${niche.recordPlural ? ` de ${esc(niche.recordPlural.toLowerCase())}` : ""}? Puedes editarlos después.</span>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer">Cargar catálogo de ejemplo</button>
      </form>`
          : ""
      }

      <form method="POST" action="/admin/menu" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">${t("med.add.title")}</span>
        <div style="display:grid;grid-template-columns:1fr 100px 130px;gap:8px">
          <input name="name" placeholder="${t("med.name.placeholder")}" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="price" type="number" step="0.01" min="0" placeholder="${t("med.price.placeholder")}" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="category" placeholder="${t("med.cat.placeholder")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
        </div>
        <input name="description" placeholder="${t("med.desc.placeholder")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;align-self:start">${t("med.add.button")}</button>
      </form>

      ${products.length ? groups : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">${t("med.empty")}</div>`}
    </div>`;

  return layout({ title, activeTab: "menu", body, env });
}
