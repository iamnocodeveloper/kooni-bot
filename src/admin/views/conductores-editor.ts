// Vista "Conductores" del nicho TAXIS. CRUD de conductores (tabla
// `taxi_drivers`): código, nombre, WhatsApp, base, vehículo y placa.
// El teléfono es lo que identifica al conductor cuando escribe al bot.
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { TaxiBasesRepo, TaxiDriversRepo, type TaxiBase, type TaxiDriver } from "../../db/taxi";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

function baseOptions(bases: TaxiBase[], selected: string | null): string {
  return (
    `<option value="">(sin base)</option>` +
    bases.map((b) => `<option value="${b.id}"${selected === b.id ? " selected" : ""}>${esc(b.name)}</option>`).join("")
  );
}

function row(d: TaxiDriver, bases: TaxiBase[]): string {
  const off = d.active === 0;
  return `<div class="border border-line" style="padding:12px 14px;display:flex;flex-direction:column;gap:9px;${off ? "opacity:.55" : ""}">
    <form method="POST" action="/admin/conductores/${d.id}" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;grid-template-columns:80px 1.2fr 1.1fr 1.1fr;gap:8px">
        <input name="code" value="${esc(d.code ?? "")}" placeholder="código" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        <input name="name" value="${esc(d.name ?? "")}" placeholder="nombre" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        <input name="phone" value="${esc(d.phone ?? "")}" placeholder="WhatsApp (+58…)" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <select name="base_id" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">${baseOptions(bases, d.base_id)}</select>
      </div>
      <div style="display:grid;grid-template-columns:1.2fr 1fr 80px auto;gap:8px;align-items:center">
        <input name="vehicle" value="${esc(d.vehicle ?? "")}" placeholder="vehículo (Aveo, Corolla…)" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <input name="plate" value="${esc(d.plate ?? "")}" placeholder="placa" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <input name="seats" type="number" min="1" value="${d.seats ?? ""}" placeholder="puestos" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Guardar</button>
      </div>
    </form>
    <div style="display:flex;gap:6px;align-items:center">
      <form method="POST" action="/admin/conductores/${d.id}/toggle" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--line);color:${off ? "var(--ok)" : "var(--warn)"};padding:5px 10px;font-size:11.5px;cursor:pointer">${off ? "Activar" : "Desactivar"}</button>
      </form>
      <form method="POST" action="/admin/conductores/${d.id}/delete" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:5px 10px;font-size:11.5px;cursor:pointer">Borrar</button>
      </form>
      ${off ? `<span class="text-warn text-[11px]">inactivo — el bot no lo reconoce</span>` : ""}
    </div>
  </div>`;
}

export async function renderConductores(env: Env, saved = false): Promise<string> {
  const db = new Db(env.DB);
  const bases = await new TaxiBasesRepo(db).all();
  const drivers = await new TaxiDriversRepo(db).list();

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Conductores</h2>
        <p class="text-muted text-[12.5px]">El conductor entra a la cola escribiendo desde su WhatsApp registrado. Sin número, el bot no lo reconoce.</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">✓ Guardado.</div>` : ""}
      ${bases.length === 0 ? `<div class="border" style="border-color:var(--warn);color:var(--warn);padding:9px 12px;font-size:12px;background:var(--panel2)">Primero creá al menos una base en <a href="/admin/bases" style="color:var(--accent)">Bases</a>.</div>` : ""}

      <form method="POST" action="/admin/conductores" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">Agregar conductor</span>
        <div style="display:grid;grid-template-columns:80px 1.2fr 1.1fr 1.1fr;gap:8px">
          <input name="code" placeholder="código" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="name" placeholder="nombre" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="phone" placeholder="WhatsApp (+58…)" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
          <select name="base_id" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">${baseOptions(bases, null)}</select>
        </div>
        <div style="display:grid;grid-template-columns:1.2fr 1fr 80px;gap:8px">
          <input name="vehicle" placeholder="vehículo" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
          <input name="plate" placeholder="placa" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
          <input name="seats" type="number" min="1" placeholder="puestos" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
        </div>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;align-self:start">Agregar</button>
      </form>

      ${drivers.length ? drivers.map((d) => row(d, bases)).join("") : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">Todavía no hay conductores. Agregá el primero arriba.</div>`}
    </div>`;

  return layout({ title: "Conductores", activeTab: "conductores", body, env });
}
