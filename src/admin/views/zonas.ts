// Vista "Zonas" del nicho RESTAURANTE. CRUD de la tabla `delivery_zones`: el
// costo de envío y el mínimo de pedido POR ZONA. La tool tomarPedido resuelve el
// envío/mínimo desde acá (no desde el texto de la KB). Sin zonas cargadas, el bot
// mantiene el comportamiento anterior.
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { DeliveryZonesRepo, type DeliveryZone } from "../../db/deliveryZones";
import { panelI18n, type T } from "../i18n";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const money = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
};

const inputStyle = "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px";

function row(t: T, z: DeliveryZone): string {
  const off = z.active === 0;
  return `<div class="border border-line" style="padding:11px 13px;display:flex;flex-direction:column;gap:8px;${off ? "opacity:.55" : ""}">
    <form method="POST" action="/admin/zonas/${z.id}" style="display:flex;flex-direction:column;gap:7px">
      <div style="display:grid;grid-template-columns:1fr 110px 120px auto;gap:8px;align-items:center">
        <input name="name" value="${esc(z.name)}" required style="${inputStyle}">
        <input name="fee" type="number" step="0.01" min="0" value="${z.fee}" placeholder="${t("zon.fee.placeholder")}" style="${inputStyle}">
        <input name="minOrder" type="number" step="0.01" min="0" value="${z.min_order}" placeholder="${t("zon.min.placeholder")}" style="${inputStyle}">
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">${t("common.save")}</button>
      </div>
      <input name="notes" value="${esc(z.notes ?? "")}" placeholder="${t("zon.notes.placeholder")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px;width:100%">
    </form>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <span class="text-dim text-[11.5px]">${t("zon.fee.short")} ${money(z.fee)} · ${t("zon.min.short")} ${money(z.min_order)}</span>
      <form method="POST" action="/admin/zonas/${z.id}/toggle" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--line);color:${off ? "var(--ok)" : "var(--warn)"};padding:5px 10px;font-size:11.5px;cursor:pointer">${off ? t("zon.activate") : t("zon.deactivate")}</button>
      </form>
      <form method="POST" action="/admin/zonas/${z.id}/delete" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:5px 10px;font-size:11.5px;cursor:pointer">${t("med.delete")}</button>
      </form>
    </div>
  </div>`;
}

export async function renderZonas(env: Env, saved = false): Promise<string> {
  const { t } = await panelI18n(env);
  const zones = await new DeliveryZonesRepo(new Db(env.DB)).all();

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("zon.title")}</h2>
        <p class="text-muted text-[12.5px]">${t("zon.subtitle")}</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">${t("med.saved")}</div>` : ""}

      <form method="POST" action="/admin/zonas" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">${t("zon.add.title")}</span>
        <div style="display:grid;grid-template-columns:1fr 100px 110px;gap:8px">
          <input name="name" placeholder="${t("zon.name.placeholder")}" required style="${inputStyle}">
          <input name="fee" type="number" step="0.01" min="0" placeholder="${t("zon.fee.placeholder")}" style="${inputStyle}">
          <input name="minOrder" type="number" step="0.01" min="0" placeholder="${t("zon.min.placeholder")}" style="${inputStyle}">
        </div>
        <input name="notes" placeholder="${t("zon.notes.placeholder")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;align-self:start">${t("med.add.button")}</button>
      </form>

      ${zones.length ? `<div style="display:flex;flex-direction:column;gap:8px">${zones.map((z) => row(t, z)).join("")}</div>` : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">${t("zon.empty")}</div>`}
    </div>`;

  return layout({ title: t("zon.title"), activeTab: "zonas", body, env });
}
