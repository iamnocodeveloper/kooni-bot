// Vista "Cola" (Central) del nicho TAXIS. Muestra la fila de cada base en vivo:
// quién es el siguiente, en qué orden y hace cuánto espera. Permite quitar a un
// conductor o subirlo de posición a mano.
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import {
  TaxiBasesRepo,
  TaxiDriversRepo,
  TaxiQueueRepo,
  type TaxiBase,
  type TaxiDriver,
  type TaxiQueueEntry,
} from "../../db/taxi";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const timeAgo = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
};

const QUEUE_JS = `
(function(){
  async function poll(){
    try{
      var r = await fetch('/admin/cola', {headers:{'x-partial':'1'}, credentials:'include'});
      if(!r.ok) return;
      var html = await r.text();
      var box = document.getElementById('cola-box');
      if(box && html) box.innerHTML = html;
    }catch(e){}
  }
  setInterval(poll, 20000);
})();
`;

function queueList(entries: TaxiQueueEntry[], driverById: Map<string, TaxiDriver>, showArrows: boolean): string {
  if (!entries.length) {
    return `<div class="text-dim text-[12px]" style="padding:8px 0">Sin conductores en la cola.</div>`;
  }
  return entries
    .map((e, i) => {
      const d = driverById.get(e.driver_id);
      const name = d?.name ?? "—";
      const extra = [d?.code ? `cód. ${d.code}` : "", d?.plate ?? "", d?.vehicle ?? ""].filter(Boolean).join(" · ");
      const up = showArrows && i > 0
        ? `<form method="POST" action="/admin/cola/${e.id}/up" style="display:inline"><button type="submit" class="chip" style="font-size:11px;padding:3px 8px;cursor:pointer">↑</button></form>`
        : "";
      const out = `<form method="POST" action="/admin/cola/${e.id}/leave" style="display:inline"><button type="submit" class="chip" style="font-size:11px;padding:3px 8px;cursor:pointer;color:var(--bad)">Quitar</button></form>`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border:1px solid var(--line);background:${i === 0 ? "var(--accent-soft)" : "var(--panel2)"}">
        <span class="font-mono" style="font-weight:700;color:${i === 0 ? "var(--accent)" : "var(--muted)"};min-width:26px">${e.position}</span>
        <span style="flex:1;color:var(--cream);font-size:12.5px">${esc(name)} <span class="text-dim text-[11px]">${esc(extra)}</span></span>
        <span class="text-dim text-[10.5px]">${timeAgo(e.arrived_at)}</span>
        ${up}${out}
      </div>`;
    })
    .join("");
}

async function colaBox(env: Env): Promise<string> {
  const db = new Db(env.DB);
  const bases = await new TaxiBasesRepo(db).active();
  const drivers = new TaxiDriversRepo(db);
  const queue = new TaxiQueueRepo(db);
  const all = await drivers.list();
  const driverById = new Map(all.map((d) => [d.id, d]));

  if (!bases.length) {
    return `<div class="text-dim text-[12.5px]" style="padding:16px">No hay bases activas. Creá una en <a href="/admin/bases" style="color:var(--accent)">Bases</a>.</div>`;
  }

  const blocks: string[] = [];
  for (const b of bases) {
    const waiting = await queue.waitingForBase(b.id);
    blocks.push(`<div class="bg-panel border border-line" style="padding:12px 14px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">${esc(b.name)}</span>
        <span class="text-dim text-[11px]">${waiting.length} en cola</span>
      </div>
      ${queueList(waiting, driverById, true)}
    </div>`);
  }
  return blocks.join("");
}

export async function renderCola(env: Env): Promise<string> {
  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Cola por base</h2>
        <p class="text-muted text-[12.5px]">El primero de cada fila es el próximo en salir. Los conductores entran solos cuando escriben desde su WhatsApp.</p>
      </div>
      <div id="cola-box" style="display:flex;flex-direction:column;gap:12px">${await colaBox(env)}</div>
    </div>
    <script>${QUEUE_JS}</script>`;

  return layout({ title: "Cola", activeTab: "cola", body, env });
}

/** Fragmento para el poll (sin layout) — lo sirve GET /admin/cola con x-partial. */
export async function renderColaFragment(env: Env): Promise<string> {
  return colaBox(env);
}
