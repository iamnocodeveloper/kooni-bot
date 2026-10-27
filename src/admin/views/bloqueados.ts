// Contactos BLOQUEADOS al bot: lista de silencio total (ni respuestas, ni
// seguimientos, ni campañas, ni disparadores). Acción humana del panel.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { ContactsRepo } from "../../db/contacts";
import { ContactBlocksRepo } from "../../db/contactBlocks";
import { channelLabel } from "../../channels/labels";
import { layout } from "./layout";
import { panelI18n } from "../i18n";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

const CHANNELS = ["waha", "whatsapp", "instagram", "messenger", "telegram", "zernio", "manychat", "twilio", "mercadolibre", "webchat"];

export async function renderBloqueados(env: Env): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const blocks = await new ContactBlocksRepo(db).list();
  const contacts = await new ContactsRepo(db).recent(500).catch(() => []);

  const options = contacts
    .map((c) => {
      const name = c.displayName || c.username || c.channelUserId;
      return `<option value="${esc(`${c.channel}|${c.channelUserId}`)}">${esc(`${name} · ${channelLabel(c.channel)} · ${c.channelUserId}`)}</option>`;
    })
    .join("");

  const rows = blocks.length
    ? blocks
        .map((b) => {
          const when = new Date(b.createdAt).toLocaleString("es", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          return `<tr>
            <td><span class="font-mono" style="font-size:10.5px;color:var(--dim)">${esc(channelLabel(b.channel))}</span></td>
            <td style="font-size:12.5px;color:var(--cream)">${esc(b.displayName || "—")}</td>
            <td><span class="font-mono" style="font-size:10.5px;color:var(--dim)">${esc(b.channelUserId)}</span></td>
            <td style="font-size:11.5px;color:var(--muted)">${esc(b.reason || "—")}</td>
            <td><span class="font-mono" style="font-size:10.5px;color:var(--dim)">${esc(when)}</span></td>
            <td style="text-align:right">
              <form method="POST" action="/admin/blocked/remove" style="display:inline">
                <input type="hidden" name="channel" value="${esc(b.channel)}">
                <input type="hidden" name="channel_user_id" value="${esc(b.channelUserId)}">
                <button type="submit" class="chip" style="font-size:11px;color:var(--ok);background:var(--panel2);border:1px solid var(--ok);padding:5px 10px;cursor:pointer">${t("blk.remove")}</button>
              </form>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:26px;font-size:13px">${t("blk.empty")}</td></tr>`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("blk.title")}</h2>
        <p class="text-muted text-[12.5px]">${t("blk.subtitle", { n: blocks.length })}</p>
      </div>

      <div class="bg-panel border" style="padding:16px 18px">
        <h3 class="font-display font-semibold text-[13px] text-cream" style="margin:0 0 4px">${t("blk.addTitle")}</h3>
        <p class="text-muted text-[11.5px]" style="margin:0 0 12px">${t("blk.addHint")}</p>
        <form method="POST" action="/admin/blocked" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dim);min-width:280px;flex:1">
            ${t("blk.existing")}
            <select name="target" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px">
              <option value="">${t("blk.manual")}</option>
              ${options}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dim)">
            ${t("blk.channel")}
            <select name="channel" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px">
              ${CHANNELS.map((ch) => `<option value="${ch}">${esc(channelLabel(ch))}</option>`).join("")}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dim);min-width:240px;flex:1">
            ID
            <input name="channel_user_id" placeholder="${t("blk.idPlaceholder")}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dim);min-width:180px;flex:1">
            ${t("blk.colReason")}
            <input name="reason" placeholder="${t("blk.reasonPlaceholder")}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px">
          </label>
          <button type="submit" class="bigbtn" style="background:var(--bad);border:1px solid var(--bad);color:var(--on-accent);padding:9px 16px;font-size:12px;font-weight:700;cursor:pointer">${t("blk.add")}</button>
        </form>
        <p class="text-muted text-[10.5px]" style="margin:10px 0 0">${t("blk.note")}</p>
      </div>

      <div class="bg-panel border xscroll" style="padding:18px 20px">
        <table style="width:100%;min-width:720px;border-collapse:collapse;font-size:12.5px">
          <tr>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">${t("blk.colChannel")}</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">${t("blk.colName")}</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">${t("blk.colContact")}</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">${t("blk.colReason")}</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">${t("blk.colDate")}</th>
            <th style="border-bottom:1px solid var(--line)"></th>
          </tr>
          ${rows}
        </table>
      </div>
    </div>`;

  return layout({ title: t("blk.title"), activeTab: "bloqueados", body, env });
}
