// Vista "Pedidos" del nicho RESTAURANTE. Lista los pedidos y deja avanzar su
// estado con un toque (cada cambio válido le avisa al cliente por su canal).
// Pensada para una tablet en el mostrador: botones grandes, y ALERTA SONORA al
// entrar un pedido nuevo (poll a /admin/pedidos/feed, sin depender del SO).
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import {
  OrdersRepo,
  ORDER_FLOW,
  ORDER_STATUS_LABEL,
  canTransition,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "../../db/orders";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const money = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
};
const timeAgo = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  recibido: "var(--warn)",
  confirmado: "var(--accent2)",
  preparacion: "var(--accent)",
  camino: "var(--accent)",
  entregado: "var(--ok)",
  cancelado: "var(--dim)",
};

function nextActions(o: Order): OrderStatus[] {
  const opts: OrderStatus[] = [];
  const idx = ORDER_FLOW.indexOf(o.status);
  if (idx >= 0 && idx < ORDER_FLOW.length - 1) opts.push(ORDER_FLOW[idx + 1]);
  if (canTransition(o.status, "cancelado")) opts.push("cancelado");
  return opts;
}

function orderCard(o: Order, items: OrderItem[], tv: boolean): string {
  const fs = tv ? { code: 20, total: 16, line: 14, btn: 15, btnPad: "12px 18px" } : { code: 14, total: 13, line: 12, btn: 12, btnPad: "7px 13px" };
  const detalle = items
    .map((it) => `${it.qty}× ${esc(it.name)}${it.notes ? ` <span class="text-dim">(${esc(it.notes)})</span>` : ""}`)
    .join(" · ");
  const acciones = nextActions(o)
    .map(
      (to) => `<form method="POST" action="/admin/pedidos/${o.id}/status" style="display:inline">
        <input type="hidden" name="status" value="${to}">
        <button type="submit" style="background:${to === "cancelado" ? "transparent" : "var(--accent)"};color:${to === "cancelado" ? "var(--bad)" : "var(--on-accent)"};border:1px solid ${to === "cancelado" ? "var(--bad)" : "var(--accent)"};padding:${fs.btnPad};font-size:${fs.btn}px;font-weight:700;cursor:pointer">
          ${to === "cancelado" ? "Cancelar" : `→ ${ORDER_STATUS_LABEL[to]}`}
        </button>
      </form>`,
    )
    .join(" ");

  return `<div data-order-id="${o.id}" class="bg-panel border" style="border-color:${STATUS_COLOR[o.status]};padding:14px 16px;display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
      <span class="font-mono text-cream" style="font-weight:700;font-size:${fs.code}px">#${esc(o.track_code ?? o.id.slice(0, 6))}</span>
      <span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${STATUS_COLOR[o.status]};border:1px solid ${STATUS_COLOR[o.status]};padding:2px 8px">${ORDER_STATUS_LABEL[o.status]}</span>
      <span class="text-dim text-[11px]">${timeAgo(o.created_at)}</span>
    </div>
    <div class="text-cream" style="font-size:${fs.total}px">${money(o.total)} <span class="text-dim text-[11px]">(${money(o.subtotal)} + ${money(o.delivery_fee)} envío) · ${esc(o.payment_method || "—")}</span></div>
    <div class="text-muted" style="font-size:${fs.line}px">${esc(o.customer_name || "sin nombre")}${o.customer_phone ? ` · ${esc(o.customer_phone)}` : ""}</div>
    ${o.address ? `<div class="text-muted" style="font-size:${fs.line}px">📍 ${esc(o.address)}${o.delivery_zone ? ` <span class="text-dim">(${esc(o.delivery_zone)})</span>` : ""}</div>` : `<div class="text-dim" style="font-size:${fs.line}px">📍 retiro en local</div>`}
    <div class="text-muted" style="line-height:1.5;font-size:${fs.line}px">${detalle}</div>
    ${o.notes ? `<div class="text-dim" style="font-size:${fs.line - 0.5}px">Nota: ${esc(o.notes)}</div>` : ""}
    ${acciones ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px">${acciones}</div>` : ""}
  </div>`;
}

const FEED_JS = `
(function(){
  var seen = new Set(Array.from(document.querySelectorAll('[data-order-id]')).map(function(e){return e.getAttribute('data-order-id')}));
  var soundOn = false, ctx = null;
  var btn = document.getElementById('ped-sound');
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
      btn.textContent = soundOn ? '🔔 Sonido activado' : '🔕 Activar sonido';
      btn.style.borderColor = soundOn ? 'var(--ok)' : 'var(--line)';
      btn.style.color = soundOn ? 'var(--ok)' : 'var(--muted)';
      if(soundOn){ ac(); beep(); }
    });
  }
  async function poll(){
    try{
      var r = await fetch('/admin/pedidos/feed', {credentials:'include'});
      if(!r.ok) return;
      var j = await r.json();
      var ids = j.ids || [];
      var fresh = ids.some(function(id){ return !seen.has(id); });
      ids.forEach(function(id){ seen.add(id); });
      var badge = document.getElementById('ped-count');
      if(badge) badge.textContent = String(j.count != null ? j.count : ids.length);
      if(fresh){
        beep();
        document.title = '🍽️ ¡Pedido nuevo!';
        setTimeout(function(){ location.reload(); }, 1400);
      }
    }catch(e){}
  }
  setInterval(poll, 15000);
})();
`;

export async function renderPedidos(
  env: Env,
  opts: { filter?: string; err?: string; tv?: boolean } = {},
): Promise<string> {
  const repo = new OrdersRepo(new Db(env.DB));
  const tv = opts.tv === true;
  const filter = opts.filter && ORDER_FLOW.includes(opts.filter as OrderStatus) ? (opts.filter as OrderStatus) : undefined;

  const active = filter ? await repo.list({ status: filter, limit: 100 }) : await repo.active();
  const recientes = filter ? [] : (await repo.list({ limit: 20 })).filter((o) => o.status === "entregado" || o.status === "cancelado");

  const withItems = async (list: Order[]) =>
    Promise.all(list.map(async (o) => orderCard(o, await repo.items(o.id), tv)));

  const activeCards = (await withItems(active)).join("");
  const recCards = (await withItems(recientes)).join("");

  const chip = (v: string | undefined, label: string) =>
    `<a href="/admin/pedidos${v ? `?status=${v}` : ""}${tv ? `${v ? "&" : "?"}tv=1` : ""}" style="font-size:12px;padding:5px 11px;border:1px solid ${filter === v || (!filter && !v) ? "var(--accent)" : "var(--line)"};color:${filter === v || (!filter && !v) ? "var(--accent)" : "var(--muted)"};text-decoration:none">${label}</a>`;

  const minmax = tv ? "minmax(340px,1fr)" : "minmax(280px,1fr)";

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column;gap:3px">
          <h2 class="font-display font-semibold text-[15px] text-cream">Pedidos <span id="ped-count" style="color:var(--accent);font-family:'IBM Plex Mono',monospace">${active.length}</span></h2>
          <p class="text-muted text-[12.5px]">Tocá para avanzar el estado — al cliente le llega el aviso por su chat.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="ped-sound" type="button" style="background:transparent;border:1px solid var(--line);color:var(--muted);padding:8px 13px;font-size:12px;font-weight:600;cursor:pointer">🔕 Activar sonido</button>
          <a href="/admin/pedidos${tv ? "" : "?tv=1"}" style="border:1px solid var(--line);color:var(--muted);padding:8px 13px;font-size:12px;text-decoration:none">${tv ? "Salir de mostrador" : "Modo mostrador"}</a>
        </div>
      </div>
      ${opts.err === "transicion" ? `<div class="border" style="border-color:var(--bad);color:var(--bad);padding:9px 12px;font-size:12px;background:var(--panel2)">Ese cambio de estado no aplica a ese pedido.</div>` : ""}
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${chip(undefined, "Activos")}
        ${ORDER_FLOW.map((s) => chip(s, ORDER_STATUS_LABEL[s])).join("")}
      </div>
      ${active.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,${minmax});gap:12px">${activeCards}</div>` : `<div class="text-dim text-[12.5px]" style="padding:24px;text-align:center">No hay pedidos ${filter ? `en "${ORDER_STATUS_LABEL[filter]}"` : "activos"}. La pantalla suena sola cuando entra uno.</div>`}
      ${recCards ? `<div style="margin-top:8px"><h3 class="font-display font-semibold text-[13px] text-cream">Cerrados recientes</h3></div><div style="display:grid;grid-template-columns:repeat(auto-fill,${minmax});gap:12px">${recCards}</div>` : ""}
    </div>
    <script>${FEED_JS}</script>`;

  return layout({ title: "Pedidos", activeTab: "pedidos", body, env });
}
