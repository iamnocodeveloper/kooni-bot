// "Comentarios" tab — los comentarios recibidos en redes (como Zernio).
// Cada comentario que llega por webhook se guarda en la tabla comments:
// texto, autor, post, y qué hizo la automatización (DM / respuesta pública).
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { CommentsRepo } from "../../db/comments";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export async function renderComentarios(env: Env): Promise<string> {
  const repo = new CommentsRepo(new Db(env.DB));
  let comments: Awaited<ReturnType<CommentsRepo["recent"]>> = [];
  let total = 0;
  try {
    comments = await repo.recent(200);
    total = await repo.count();
  } catch (e) {
    // tabla no existe aún o error — mostrar vacío
    console.warn("[comentarios] no se pudieron cargar:", e);
  }

  const rows = comments.length
    ? comments
        .map((c) => {
          const when = new Date(c.createdAt).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          const author = c.authorName || c.authorUsername || "—";
          const statusChips = [
            c.dmSent ? `<span class="font-mono" style="font-size:10px;border:1px solid var(--ok);color:var(--ok);padding:2px 8px">DM enviado</span>` : "",
            c.publicReplySent ? `<span class="font-mono" style="font-size:10px;border:1px solid var(--accent);color:var(--accent2);padding:2px 8px">Resp. pública ✓</span>` : "",
            c.ruleId ? `<span class="font-mono" style="font-size:10px;border:1px solid var(--linelit);color:var(--muted);padding:2px 8px">regla</span>` : "",
          ]
            .filter(Boolean)
            .join(" ") || `<span class="font-mono" style="font-size:10px;color:var(--dim)">sin regla</span>`;

          return `<tr>
            <td style="font-size:12px;color:var(--cream);max-width:340px">${esc(c.text ?? "")}</td>
            <td style="font-size:12px">${esc(author)}</td>
            <td><span class="font-mono" style="font-size:10.5px;color:var(--dim)">${esc(c.platform)}</span></td>
            <td><span style="display:flex;gap:5px;flex-wrap:wrap">${statusChips}</span></td>
            <td><span class="font-mono" style="font-size:10.5px;color:var(--dim)">${esc(when)}</span></td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:26px;font-size:13px">Aún no hay comentarios registrados. Cuando alguien comente en tus publicaciones, aparecerán aquí.</td></tr>`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Comentarios</h2>
        <p class="text-muted text-[12.5px]">Todos los comentarios que llegan a tus publicaciones (${total} en total). Aquí ves quién comentó, qué dijo, y qué hizo la automatización (DM / respuesta pública).</p>
      </div>
      <div class="bg-panel border" style="padding:18px 20px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <tr>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">Comentario</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">Autor</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">Plataforma</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">Automatización</th>
            <th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line)">Fecha</th>
          </tr>
          ${rows}
        </table>
      </div>
    </div>`;

  return layout({ title: "Comentarios", activeTab: "comentarios", body, env });
}
