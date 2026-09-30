// Vista "Conductores" del nicho TAXIS. CRUD de conductores (tabla
// `taxi_drivers`): código, nombre, WhatsApp, base, vehículo y placa.
// El teléfono es lo que identifica al conductor cuando escribe al bot.
import type { Env } from "../../env";
import { layout } from "./layout";
import { panelI18n, type T } from "../i18n";
import { Db } from "../../db/client";
import { TaxiBasesRepo, TaxiDriversRepo, type TaxiBase, type TaxiDriver } from "../../db/taxi";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

function baseOptions(t: T, bases: TaxiBase[], selected: string | null): string {
  return (
    `<option value="">${t("ced.noBase")}</option>` +
    bases.map((b) => `<option value="${b.id}"${selected === b.id ? " selected" : ""}>${esc(b.name)}</option>`).join("")
  );
}

function row(t: T, d: TaxiDriver, bases: TaxiBase[]): string {
  const off = d.active === 0;
  return `<div class="border border-line" style="padding:12px 14px;display:flex;flex-direction:column;gap:9px;${off ? "opacity:.55" : ""}">
    <form method="POST" action="/admin/conductores/${d.id}" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;grid-template-columns:80px 1.2fr 1.1fr 1.1fr;gap:8px">
        <input name="code" value="${esc(d.code ?? "")}" placeholder="${t("ced.code")}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        <input name="name" value="${esc(d.name ?? "")}" placeholder="${t("ced.name")}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        <input name="phone" value="${esc(d.phone ?? "")}" placeholder="${t("ced.whatsapp")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <select name="base_id" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">${baseOptions(t, bases, d.base_id)}</select>
      </div>
      <div style="display:grid;grid-template-columns:1.2fr 1fr 80px auto;gap:8px;align-items:center">
        <input name="vehicle" value="${esc(d.vehicle ?? "")}" placeholder="${t("ced.vehicleLong")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <input name="plate" value="${esc(d.plate ?? "")}" placeholder="${t("ced.plate")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <input name="seats" type="number" min="1" value="${d.seats ?? ""}" placeholder="${t("ced.seats")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">${t("common.save")}</button>
      </div>
    </form>
    <div style="display:flex;gap:6px;align-items:center">
      <form method="POST" action="/admin/conductores/${d.id}/toggle" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--line);color:${off ? "var(--ok)" : "var(--warn)"};padding:5px 10px;font-size:11.5px;cursor:pointer">${off ? t("ced.activate") : t("ced.deactivate")}</button>
      </form>
      <form method="POST" action="/admin/conductores/${d.id}/delete" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:5px 10px;font-size:11.5px;cursor:pointer">${t("ced.delete")}</button>
      </form>
      ${off ? `<span class="text-warn text-[11px]">${t("ced.inactive")}</span>` : ""}
    </div>
  </div>`;
}

export async function renderConductores(env: Env, saved = false): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const bases = await new TaxiBasesRepo(db).all();
  const drivers = await new TaxiDriversRepo(db).list();

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("ced.title")}</h2>
        <p class="text-muted text-[12.5px]">${t("ced.subtitle")}</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">${t("ced.saved")}</div>` : ""}
      ${bases.length === 0 ? `<div class="border" style="border-color:var(--warn);color:var(--warn);padding:9px 12px;font-size:12px;background:var(--panel2)">${t("ced.noBasesLead")} <a href="/admin/bases" style="color:var(--accent)">${t("ced.bases")}</a>.</div>` : ""}

      <form method="POST" action="/admin/conductores" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">${t("ced.addTitle")}</span>
        <div style="display:grid;grid-template-columns:80px 1.2fr 1.1fr 1.1fr;gap:8px">
          <input name="code" placeholder="${t("ced.code")}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="name" placeholder="${t("ced.name")}" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="phone" placeholder="${t("ced.whatsapp")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
          <select name="base_id" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">${baseOptions(t, bases, null)}</select>
        </div>
        <div style="display:grid;grid-template-columns:1.2fr 1fr 80px;gap:8px">
          <input name="vehicle" placeholder="${t("ced.vehicle")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
          <input name="plate" placeholder="${t("ced.plate")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
          <input name="seats" type="number" min="1" placeholder="${t("ced.seats")}" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
        </div>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;align-self:start">${t("ced.add")}</button>
      </form>

      ${drivers.length ? drivers.map((d) => row(t, d, bases)).join("") : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">${t("ced.empty")}</div>`}
    </div>`;

  return layout({ title: t("ced.title"), activeTab: "conductores", body, env });
}
