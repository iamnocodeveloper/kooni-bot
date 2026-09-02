// "Contactos" tab — TODOS los que interactúan (DM o comentario), separados de
// Leads. Un contacto se crea al primer mensaje o comentario; el lead es el
// contacto calificado (intención capturada por la IA).
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { ContactsRepo } from "../../db/contacts";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export async function renderContactos(env: Env): Promise<string> {
  const repo = new ContactsRepo(new Db(env.DB));
  let contacts: Awaited<ReturnType<ContactsRepo["recent"]>> = [];
  let total = 0;
  try {
    contacts = await repo.recent(200);
    total = await repo.count();
  } catch (e) {
    console.warn("[contactos] no se pudieron cargar:", e);
  }

  const rows = contacts.length
    ? contacts
        .map((c) => {
          const name = c.displayName || c.username || "—";
          const last = new Date(c.lastInteractionAt).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          return `<tr>
            <td style="font-size:12.5px;color:var(--cream)">${esc(name)}</td>
            <td><span class="font-mono" style="font-size:10.5px;color:var(--dim)">${esc(c.channel)}</span></td>
            <td><span class="font-mono" style="font-size:10.5px;color:var(--dim)">${esc(c.channelUserId.slice(0, 24))}…</span></td>
            <td><span class="font-mono" style="font-size:11px;color:var(--accent2)">${c.interactionCount}</span></td>
            <td><span class="font-mono" style="font-size:10.5px;color:var(--dim)">${esc(last)}</span></td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:26px;font-size:13px">Aún no hay contactos. Cuando alguien te escriba o comente, aparecerá aquí.</td></tr>`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Contactos</h2>
        <p class="text-muted text-[12.5px]">Todos los que interactuaron con tu bot (${total} en total) — DMs o comentarios. Es la lista cruda de interacción; los <b>Leads</b> son los que además mostraron interés y el bot capturó su intención.</p>
      </div>
      <div class="bg-panel border xscroll" style="padding:18px 20px">
        <table style="width:100%;min-width:560px;border-collapse:collapse;font-size:12.5px">
          <tr>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">Nombre</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">Canal</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">ID</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">Interacciones</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">Última</th>
          </tr>
          ${rows}
        </table>
      </div>
    </div>`;

  return layout({ title: "Contactos", activeTab: "contactos", body, env });
}
