// Vista "Menú" del nicho RESTAURANTE. CRUD de productos (tabla `products`).
// Lo usa la tool tomarPedido (reconciliar precios), catalogQuery y —más
// adelante— el menú web público. Sin categoría = "Sin categoría".
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { ProductsRepo, type Product } from "../../db/products";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const money = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
};

function row(p: Product): string {
  const off = p.active === 0;
  return `<div class="border border-line" style="padding:11px 13px;display:flex;flex-direction:column;gap:8px;${off ? "opacity:.55" : ""}">
    <form method="POST" action="/admin/menu/${p.id}" style="display:flex;flex-direction:column;gap:7px">
      <div style="display:grid;grid-template-columns:1fr 90px 120px auto;gap:8px;align-items:center">
        <input name="name" value="${esc(p.name)}" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        <input name="price" type="number" step="0.01" min="0" value="${p.price}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        <input name="category" value="${esc(p.category ?? "")}" placeholder="categoría" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Guardar</button>
      </div>
      <input name="description" value="${esc(p.description ?? "")}" placeholder="descripción (opcional)" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px;width:100%">
    </form>
    <div style="display:flex;gap:6px;align-items:center">
      <form method="POST" action="/admin/menu/${p.id}/toggle" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--line);color:${off ? "var(--ok)" : "var(--warn)"};padding:5px 10px;font-size:11.5px;cursor:pointer">${off ? "Activar" : "Marcar agotado"}</button>
      </form>
      <form method="POST" action="/admin/menu/${p.id}/delete" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:5px 10px;font-size:11.5px;cursor:pointer">Borrar</button>
      </form>
      ${off ? `<span class="text-warn text-[11px]">agotado — el bot no lo ofrece</span>` : ""}
    </div>
  </div>`;
}

export async function renderMenu(env: Env, saved = false): Promise<string> {
  const products = await new ProductsRepo(new Db(env.DB)).all();
  const byCat = new Map<string, Product[]>();
  for (const p of products) {
    const k = p.category?.trim() || "Sin categoría";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(p);
  }

  const groups = [...byCat.entries()]
    .map(
      ([cat, list]) => `<div style="display:flex;flex-direction:column;gap:8px">
        <h3 class="font-display font-semibold text-[13px] text-cream">${esc(cat)} <span class="text-dim text-[11px]">· ${list.length}</span></h3>
        ${list.map(row).join("")}
      </div>`,
    )
    .join("");

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Menú</h2>
        <p class="text-muted text-[12.5px]">Lo que el bot puede vender. Marcá "agotado" y el bot deja de ofrecerlo al instante.</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">✓ Guardado.</div>` : ""}

      <form method="POST" action="/admin/menu" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">Agregar producto</span>
        <div style="display:grid;grid-template-columns:1fr 100px 130px;gap:8px">
          <input name="name" placeholder="nombre" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="price" type="number" step="0.01" min="0" placeholder="precio" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="category" placeholder="categoría" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
        </div>
        <input name="description" placeholder="descripción (opcional)" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;align-self:start">Agregar</button>
      </form>

      ${products.length ? groups : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">El menú está vacío. Agregá el primer producto arriba o pegá el menú como documento en Conocimiento.</div>`}
    </div>`;

  return layout({ title: "Menú", activeTab: "menu", body, env });
}
