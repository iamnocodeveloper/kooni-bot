// Vista "Bases" del nicho TAXIS. CRUD de bases (tabla `taxi_bases`): nombre,
// dirección, coordenadas, zonas que cubre (con su tarifa) y tarifa base.
// Es lo que usa el bot para elegir la base más cercana al cliente.
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { TaxiBasesRepo, parseZones, type TaxiBase, type TaxiZone } from "../../db/taxi";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

/** Zonas → texto "Nombre : tarifa", una por línea (lo que ve el textarea). */
export function zonesToText(base: Pick<TaxiBase, "zones">): string {
  return parseZones(base)
    .map((z) => `${z.name} : ${z.fee}`)
    .join("\n");
}

/** Texto del textarea → zonas. Acepta "Nombre : 30", "Nombre, 30" o "Nombre". */
export function parseZonesInput(raw: string): TaxiZone[] {
  return String(raw ?? "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.split(/:|,|\|/);
      const name = (m[0] ?? "").trim();
      const fee = Number(String(m[1] ?? "").replace(/[^0-9.\-]/g, ""));
      return { name, fee: Number.isFinite(fee) && fee > 0 ? fee : 0 };
    })
    .filter((z) => z.name);
}

function row(b: TaxiBase): string {
  const off = b.active === 0;
  return `<div class="border border-line" style="padding:12px 14px;display:flex;flex-direction:column;gap:9px;${off ? "opacity:.55" : ""}">
    <form method="POST" action="/admin/bases/${b.id}" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;grid-template-columns:1.4fr 1.2fr 90px 90px;gap:8px">
        <input name="name" value="${esc(b.name)}" required placeholder="nombre" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        <input name="address" value="${esc(b.address ?? "")}" placeholder="dirección" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <input name="lat" type="number" step="any" value="${b.lat ?? ""}" placeholder="lat" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
        <input name="lng" type="number" step="any" value="${b.lng ?? ""}" placeholder="lng" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:6px 8px;font-size:12px">
      </div>
      <textarea name="zones" rows="3" placeholder="Una zona por línea: Nombre : tarifa (ej. Centro : 30)" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12px;resize:vertical">${esc(zonesToText(b))}</textarea>
      <div style="display:grid;grid-template-columns:120px 120px 1fr auto;gap:8px;align-items:center">
        <label class="text-dim text-[11.5px]" style="display:flex;flex-direction:column;gap:3px">Tarifa base
          <input name="base_fare" type="number" step="0.01" min="0" value="${b.base_fare}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        </label>
        <label class="text-dim text-[11.5px]" style="display:flex;flex-direction:column;gap:3px">ETA (min)
          <input name="eta_min" type="number" min="0" value="${b.eta_min}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px">
        </label>
        <label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;align-self:end;padding-bottom:6px">
          <input type="checkbox" name="is_default" value="1" ${b.is_default ? "checked" : ""}> Base por defecto (si la zona no matchea)
        </label>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;align-self:end">Guardar</button>
      </div>
    </form>
    <div style="display:flex;gap:6px;align-items:center">
      <form method="POST" action="/admin/bases/${b.id}/toggle" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--line);color:${off ? "var(--ok)" : "var(--warn)"};padding:5px 10px;font-size:11.5px;cursor:pointer">${off ? "Activar" : "Desactivar"}</button>
      </form>
      <form method="POST" action="/admin/bases/${b.id}/delete" style="display:inline">
        <button type="submit" style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:5px 10px;font-size:11.5px;cursor:pointer">Borrar</button>
      </form>
    </div>
  </div>`;
}

export async function renderBases(env: Env, saved = false): Promise<string> {
  const bases = await new TaxiBasesRepo(new Db(env.DB)).all();

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Bases</h2>
        <p class="text-muted text-[12.5px]">Cada base con sus zonas y tarifas. El bot elige la más cercana al cliente que tenga conductores en la cola.</p>
      </div>
      ${saved ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">✓ Guardado.</div>` : ""}

      <form method="POST" action="/admin/bases" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">Agregar base</span>
        <div style="display:grid;grid-template-columns:1fr 1fr 90px 90px;gap:8px">
          <input name="name" placeholder="nombre" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="address" placeholder="dirección" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
          <input name="lat" type="number" step="any" placeholder="lat" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
          <input name="lng" type="number" step="any" placeholder="lng" style="background:var(--bg);border:1px solid var(--line);color:var(--muted);padding:7px 9px;font-size:12px">
        </div>
        <textarea name="zones" rows="2" placeholder="Zonas (una por línea): Centro : 30" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12px;resize:vertical"></textarea>
        <div style="display:grid;grid-template-columns:120px 120px 1fr;gap:8px">
          <input name="base_fare" type="number" step="0.01" min="0" placeholder="tarifa base" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <input name="eta_min" type="number" min="0" placeholder="ETA min" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 9px;font-size:12.5px">
          <label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px"><input type="checkbox" name="is_default" value="1"> Base por defecto</label>
        </div>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;align-self:start">Agregar</button>
      </form>

      ${bases.length ? bases.map(row).join("") : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">Todavía no hay bases. Agregá la primera arriba.</div>`}
    </div>`;

  return layout({ title: "Bases", activeTab: "bases", body, env });
}
