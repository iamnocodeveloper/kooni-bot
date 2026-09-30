// Vista "Viajes" del nicho TAXIS. Lista las solicitudes vivas, deja avanzar su
// estado (cada cambio válido le avisa al cliente) y —cuando no hay conductor—
// permite asignar uno a mano desde el mismo panel. Igual que Pedidos: alerta
// SONORA al entrar una solicitud nueva (poll a /admin/viajes/feed).
import type { Env } from "../../env";
import { layout } from "./layout";
import { panelI18n, type T, type MessageKey } from "../i18n";
import { Db } from "../../db/client";
import {
  TaxiBasesRepo,
  TaxiDriversRepo,
  TaxiTripsRepo,
  TAXI_TRIP_FLOW,
  TAXI_TRIP_LABEL,
  canTransitionTrip,
  type TaxiBase,
  type TaxiDriver,
  type TaxiTrip,
  type TaxiTripStatus,
} from "../../db/taxi";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const money = (n: number | null) => {
  if (n === null || !Number.isFinite(n)) return "—";
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
};
const timeAgo = (t: T, ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return t("via.ago.now");
  if (m < 60) return t("via.ago.min", { m });
  const h = Math.round(m / 60);
  return h < 24 ? t("via.ago.h", { h }) : t("via.ago.d", { d: Math.round(h / 24) });
};

const STATUS_COLOR: Record<TaxiTripStatus, string> = {
  solicitado: "var(--warn)",
  asignado: "var(--accent2)",
  en_camino: "var(--accent)",
  completado: "var(--ok)",
  cancelado: "var(--dim)",
  sin_conductor: "var(--bad)",
};

/** Estado del viaje → clave i18n (las etiquetas visibles viven en el diccionario). */
const STATUS_KEY: Record<TaxiTripStatus, MessageKey> = {
  solicitado: "via.status.solicitado",
  asignado: "via.status.asignado",
  en_camino: "via.status.en_camino",
  completado: "via.status.completado",
  cancelado: "via.status.cancelado",
  sin_conductor: "via.status.sin_conductor",
};
const statusLabel = (t: T, s: TaxiTripStatus) => t(STATUS_KEY[s]);

function nextActions(t: TaxiTrip): TaxiTripStatus[] {
  const opts: TaxiTripStatus[] = [];
  const idx = TAXI_TRIP_FLOW.indexOf(t.status);
  if (idx >= 0 && idx < TAXI_TRIP_FLOW.length - 1) {
    const next = TAXI_TRIP_FLOW[idx + 1];
    if (canTransitionTrip(t.status, next)) opts.push(next);
  }
  if (canTransitionTrip(t.status, "cancelado")) opts.push("cancelado");
  return opts;
}

function tripCard(
  t: T,
  trip: TaxiTrip,
  base: TaxiBase | undefined,
  driver: TaxiDriver | undefined,
  drivers: TaxiDriver[],
  tv: boolean,
): string {
  const fs = tv
    ? { code: 20, line: 14, btn: 15, btnPad: "12px 18px" }
    : { code: 14, line: 12, btn: 12, btnPad: "7px 13px" };

  const canAssign = canTransitionTrip(trip.status, "asignado");
  const options = drivers
    .map((d) => {
      const b = d.base_id ? "" : "";
      const label = `${d.name ?? t("via.noName")}${d.code ? ` · ${d.code}` : ""}${d.plate ? ` · ${d.plate}` : ""}`;
      return `<option value="${d.id}"${trip.driver_id === d.id ? " selected" : ""}>${esc(label)}</option>${b}`;
    })
    .join("");

  const assignForm = canAssign
    ? `<form method="POST" action="/admin/viajes/${trip.id}/assign" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <select name="driver_id" required style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:${fs.btnPad};font-size:${fs.btn - 1}px;max-width:230px">
          <option value="">${t("via.chooseDriver")}</option>
          ${options}
        </select>
        <button type="submit" style="background:var(--accent);color:var(--on-accent);border:1px solid var(--accent);padding:${fs.btnPad};font-size:${fs.btn}px;font-weight:700;cursor:pointer">${t("via.assign")}</button>
      </form>`
    : "";

  const acciones = nextActions(trip)
    .map(
      (to) => `<form method="POST" action="/admin/viajes/${trip.id}/status" style="display:inline">
        <input type="hidden" name="status" value="${to}">
        <button type="submit" style="background:${to === "cancelado" ? "transparent" : "var(--accent)"};color:${to === "cancelado" ? "var(--bad)" : "var(--on-accent)"};border:1px solid ${to === "cancelado" ? "var(--bad)" : "var(--accent)"};padding:${fs.btnPad};font-size:${fs.btn}px;font-weight:700;cursor:pointer">
          ${to === "cancelado" ? t("via.cancel") : `→ ${statusLabel(t, to)}`}
        </button>
      </form>`,
    )
    .join(" ");

  const loc = trip.pickup_address || trip.zone || t("via.noLocation");
  return `<div data-trip-id="${trip.id}" class="bg-panel border" style="border-color:${STATUS_COLOR[trip.status]};padding:14px 16px;display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
      <span class="font-mono text-cream" style="font-weight:700;font-size:${fs.code}px">🚕 ${esc(loc)}</span>
      <span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${STATUS_COLOR[trip.status]};border:1px solid ${STATUS_COLOR[trip.status]};padding:2px 8px">${statusLabel(t, trip.status)}</span>
      <span class="text-dim text-[11px]">${timeAgo(t, trip.created_at)}</span>
    </div>
    <div class="text-muted" style="font-size:${fs.line}px">
      ${esc(trip.customer_name || t("via.noName"))}${trip.customer_phone ? ` · ${esc(trip.customer_phone)}` : ""}
      ${base ? ` · ${t("via.base")} ${esc(base.name)}` : ""}
      ${trip.fare_estimate != null ? ` · ${t("via.est")} ${money(trip.fare_estimate)}` : ""}
    </div>
    ${trip.dest_address ? `<div class="text-muted" style="font-size:${fs.line}px">🎯 ${esc(trip.dest_address)}</div>` : ""}
    <div class="text-muted" style="font-size:${fs.line}px">${t("via.driver")} ${driver ? esc(`${driver.name ?? "—"}${driver.plate ? ` · ${driver.plate}` : ""}`) : `<span class="text-bad">${t("via.unassigned")}</span>`}</div>
    ${trip.notes ? `<div class="text-dim" style="font-size:${fs.line - 0.5}px">${t("via.note")} ${esc(trip.notes)}</div>` : ""}
    ${assignForm ? `<div style="margin-top:2px">${assignForm}</div>` : ""}
    ${acciones ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${acciones}</div>` : ""}
  </div>`;
}

const feedJs = (t: T) => `
(function(){
  var seen = new Set(Array.from(document.querySelectorAll('[data-trip-id]')).map(function(e){return e.getAttribute('data-trip-id')}));
  var soundOn = false, ctx = null;
  var btn = document.getElementById('trip-sound');
  function ac(){ try{ ctx = ctx || new (window.AudioContext||window.webkitAudioContext)(); if(ctx.state==='suspended') ctx.resume(); }catch(e){} return ctx; }
  function beep(){
    if(!soundOn) return;
    var c = ac(); if(!c) return;
    var t = c.currentTime;
    [880,1245,880].forEach(function(f,i){
      var o=c.createOscillator(), g=c.createGain();
      o.type='sine'; o.frequency.value=f;
      o.connect(g); g.connect(c.destination);
      var s=t+i*0.16;
      g.gain.setValueAtTime(0.0001,s);
      g.gain.exponentialRampToValueAtTime(0.35,s+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,s+0.30);
      o.start(s); o.stop(s+0.32);
    });
    if(navigator.vibrate) try{ navigator.vibrate([150,70,150]); }catch(e){}
  }
  if(btn){
    btn.addEventListener('click', function(){
      soundOn = !soundOn;
      btn.textContent = soundOn ? '${t("via.soundOn")}' : '${t("via.soundOff")}';
      btn.style.borderColor = soundOn ? 'var(--ok)' : 'var(--line)';
      btn.style.color = soundOn ? 'var(--ok)' : 'var(--muted)';
      if(soundOn){ ac(); beep(); }
    });
  }
  async function poll(){
    try{
      var r = await fetch('/admin/viajes/feed', {credentials:'include'});
      if(!r.ok) return;
      var j = await r.json();
      var ids = j.ids || [];
      var fresh = ids.some(function(id){ return !seen.has(id); });
      ids.forEach(function(id){ seen.add(id); });
      var badge = document.getElementById('trip-count');
      if(badge) badge.textContent = String(j.count != null ? j.count : ids.length);
      if(fresh){
        beep();
        document.title = '${t("via.newTrip")}';
        setTimeout(function(){ location.reload(); }, 1400);
      }
    }catch(e){}
  }
  setInterval(poll, 15000);
})();
`;

export async function renderViajes(
  env: Env,
  opts: { filter?: string; err?: string; tv?: boolean } = {},
): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const trips = new TaxiTripsRepo(db);
  const tv = opts.tv === true;
  const filter = opts.filter && (TAXI_TRIP_LABEL as Record<string, string>)[opts.filter] ? (opts.filter as TaxiTripStatus) : undefined;

  const active = filter ? await trips.list({ status: filter, limit: 100 }) : await trips.active();
  const recientes = filter
    ? []
    : (await trips.list({ limit: 20 })).filter((t) => t.status === "completado" || t.status === "cancelado");

  const baseList = await new TaxiBasesRepo(db).all();
  const baseById = new Map(baseList.map((b) => [b.id, b]));
  const driverList = (await new TaxiDriversRepo(db).list()).filter((d) => d.active === 1);
  const driverById = new Map(driverList.map((d) => [d.id, d]));

  const cards = (list: TaxiTrip[]) =>
    list.map((trip) => tripCard(t, trip, baseById.get(trip.base_id ?? ""), driverById.get(trip.driver_id ?? ""), driverList, tv)).join("");

  const chip = (v: string | undefined, label: string) =>
    `<a href="/admin/viajes${v ? `?status=${v}` : ""}${tv ? `${v ? "&" : "?"}tv=1` : ""}" style="font-size:12px;padding:5px 11px;border:1px solid ${filter === v || (!filter && !v) ? "var(--accent)" : "var(--line)"};color:${filter === v || (!filter && !v) ? "var(--accent)" : "var(--muted)"};text-decoration:none">${label}</a>`;

  const minmax = tv ? "minmax(340px,1fr)" : "minmax(280px,1fr)";
  const chips = (["solicitado", "asignado", "en_camino", "sin_conductor", "completado", "cancelado"] as TaxiTripStatus[]);

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column;gap:3px">
          <h2 class="font-display font-semibold text-[15px] text-cream">${t("via.title")} <span id="trip-count" style="color:var(--accent);font-family:'IBM Plex Mono',monospace">${active.length}</span></h2>
          <p class="text-muted text-[12.5px]">${t("via.subtitle")}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="trip-sound" type="button" style="background:transparent;border:1px solid var(--line);color:var(--muted);padding:8px 13px;font-size:12px;font-weight:600;cursor:pointer">${t("via.soundOff")}</button>
          <a href="/admin/viajes${tv ? "" : "?tv=1"}" style="border:1px solid var(--line);color:var(--muted);padding:8px 13px;font-size:12px;text-decoration:none">${tv ? t("via.exitTv") : t("via.tv")}</a>
        </div>
      </div>
      ${opts.err === "transicion" ? `<div class="border" style="border-color:var(--bad);color:var(--bad);padding:9px 12px;font-size:12px;background:var(--panel2)">${t("via.err.transicion")}</div>` : ""}
      ${opts.err === "sinconductor" ? `<div class="border" style="border-color:var(--bad);color:var(--bad);padding:9px 12px;font-size:12px;background:var(--panel2)">${t("via.err.sinconductor")}</div>` : ""}
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${chip(undefined, t("via.filter.active"))}
        ${chips.map((s) => chip(s, statusLabel(t, s))).join("")}
      </div>
      ${active.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,${minmax});gap:12px">${cards(active)}</div>` : `<div class="text-dim text-[12.5px]" style="padding:24px;text-align:center">${t("via.empty", { what: filter ? t("via.empty.filtered", { s: statusLabel(t, filter) }) : t("via.empty.active") })}</div>`}
      ${recientes.length ? `<div style="margin-top:8px"><h3 class="font-display font-semibold text-[13px] text-cream">${t("via.closed")}</h3></div><div style="display:grid;grid-template-columns:repeat(auto-fill,${minmax});gap:12px">${cards(recientes)}</div>` : ""}
    </div>
    <script>${feedJs(t)}</script>`;

  return layout({ title: t("via.title"), activeTab: "viajes", body, env });
}
