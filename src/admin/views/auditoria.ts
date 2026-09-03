// "Auditoría" (§ U) — ventana de SOLO LECTURA con cada acción de un operador del
// panel: quién (huella de IP + navegador), cuándo, qué acción, qué modificó y el
// valor anterior vs. el nuevo. No hay ninguna ruta que edite o borre estas filas
// desde el panel — la única baja es la purga nocturna por retención.
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { AuditRepo, type AuditEntry, type AuditFilter } from "../../db/auditLog";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

/** Código de acción → frase legible para el dueño. */
const ACTION_LABELS: Record<string, string> = {
  "settings.update": "Cambió una configuración",
  "login.ok": "Inició sesión",
  "login.fail": "Contraseña incorrecta",
  "login.blocked": "Bloqueado por intentos fallidos",
  "logout": "Cerró sesión",
  "kb.doc.create": "Creó un documento de conocimiento",
  "kb.doc.update": "Editó un documento de conocimiento",
  "kb.doc.delete": "Borró un documento de conocimiento",
  "rule.create": "Creó una automatización",
  "rule.update": "Editó una automatización",
  "rule.toggle": "Activó/desactivó una automatización",
  "rule.delete": "Borró una automatización",
  "lead.status": "Cambió el estado de un lead",
  "ticket.resolve": "Resolvió un ticket",
  "conversation.pause": "Pausó una conversación",
  "conversation.resume": "Reanudó una conversación (devolvió al bot)",
  "conversation.reply": "Respondió en una conversación",
  "mejora.apply": "Aplicó una mejora sugerida",
  "mejora.dismiss": "Descartó una mejora sugerida",
  "campaign.send": "Envió una campaña",
};

function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a;
}

/** User-agent → resumen corto (navegador + sistema). */
function uaShort(ua: string | undefined): string {
  if (!ua) return "—";
  const u = ua.toLowerCase();
  const browser = u.includes("edg/")
    ? "Edge"
    : u.includes("chrome/") && !u.includes("chromium")
      ? "Chrome"
      : u.includes("firefox/")
        ? "Firefox"
        : u.includes("safari/") && !u.includes("chrome")
          ? "Safari"
          : u.includes("curl")
            ? "curl"
            : "otro";
  const os = u.includes("windows")
    ? "Windows"
    : u.includes("iphone") || u.includes("ipad")
      ? "iOS"
      : u.includes("android")
        ? "Android"
        : u.includes("mac os")
          ? "Mac"
          : u.includes("linux")
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

function fmtWhen(at: number): string {
  return new Date(at).toLocaleString("es", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function resultBadge(result: string): string {
  const map: Record<string, [string, string]> = {
    ok: ["var(--ok)", "OK"],
    denied: ["var(--bad)", "DENEGADO"],
    error: ["var(--warn)", "ERROR"],
  };
  const [color, label] = map[result] ?? ["var(--dim)", result.toUpperCase()];
  return `<span style="font-size:9.5px;letter-spacing:.1em;color:${color};border:1px solid ${color};padding:2px 7px;font-weight:700">${label}</span>`;
}

function diffCell(before?: string, after?: string): string {
  if (before === undefined && after === undefined) return `<span style="color:var(--dim)">—</span>`;
  const b = before ?? "";
  const a = after ?? "";
  return `
    <div style="display:flex;flex-direction:column;gap:3px;max-width:340px">
      ${b !== "" ? `<span class="font-mono" style="font-size:10.5px;color:var(--dim);text-decoration:line-through;word-break:break-word">${esc(b)}</span>` : `<span style="font-size:10px;color:var(--dim)">(vacío)</span>`}
      <span class="font-mono" style="font-size:11px;color:var(--accent2);word-break:break-word">${a !== "" ? esc(a) : "(vacío)"}</span>
    </div>`;
}

export interface AuditoriaQuery {
  action?: string;
  actorIpHash?: string;
  text?: string;
  before?: number;
}

const PAGE = 60;

export async function renderAuditoria(env: Env, q: AuditoriaQuery = {}): Promise<string> {
  const repo = new AuditRepo(new Db(env.DB));
  let rows: AuditEntry[] = [];
  let actions: string[] = [];
  let total = 0;
  try {
    const filter: AuditFilter = { limit: PAGE + 1, ...q };
    rows = await repo.list(filter);
    actions = await repo.distinctActions();
    total = await repo.count();
  } catch (e) {
    console.warn("[auditoria] no se pudo cargar:", e);
  }

  const hasMore = rows.length > PAGE;
  if (hasMore) rows = rows.slice(0, PAGE);
  const oldestAt = rows.length ? rows[rows.length - 1].at : undefined;

  const filterQS = (extra: Record<string, string | number | undefined>): string => {
    const p = new URLSearchParams();
    if (q.action) p.set("action", q.action);
    if (q.actorIpHash) p.set("actor", q.actorIpHash);
    if (q.text) p.set("q", q.text);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const actionOptions = ["", ...actions]
    .map(
      (a) =>
        `<option value="${esc(a)}"${q.action === a ? " selected" : ""}>${a === "" ? "Todas las acciones" : esc(actionLabel(a))}</option>`,
    )
    .join("");

  const filterBar = `
    <form method="GET" action="/admin/auditoria" class="xscroll"
          style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);padding:12px 14px">
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="text-[10.5px]" style="color:var(--dim);letter-spacing:.08em;text-transform:uppercase">Acción</span>
        <select name="action" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 10px;font-size:12px;outline:none">${actionOptions}</select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:160px">
        <span class="text-[10.5px]" style="color:var(--dim);letter-spacing:.08em;text-transform:uppercase">Buscar (texto / clave)</span>
        <input type="text" name="q" value="${esc(q.text ?? "")}" placeholder="ej. tono, licencia, token…"
               style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 10px;font-size:12px;outline:none">
      </label>
      ${q.actorIpHash ? `<input type="hidden" name="actor" value="${esc(q.actorIpHash)}">` : ""}
      <button type="submit" class="text-[12px] font-display font-semibold"
              style="border:1px solid var(--line);color:var(--cream);padding:8px 14px;cursor:pointer;background:none">Filtrar</button>
      ${
        q.action || q.text || q.actorIpHash
          ? `<a href="/admin/auditoria" class="text-[11.5px]" style="color:var(--dim);padding:8px 4px">limpiar</a>`
          : ""
      }
      <a href="/admin/auditoria/export.csv${filterQS({})}" class="text-[11.5px] font-display font-semibold"
         style="margin-left:auto;border:1px solid var(--line);color:var(--cream);padding:8px 12px;text-decoration:none">Exportar CSV</a>
    </form>`;

  const tableRows = rows.length
    ? rows
        .map((r) => {
          const ipTail = r.actorIpHash ? `IP …${r.actorIpHash.slice(-6)}` : "IP —";
          const who = `
            <div style="display:flex;flex-direction:column;gap:1px">
              <span class="text-[12px] text-cream">${esc(r.actorName ?? "admin")}</span>
              <span class="font-mono text-[10px]" style="color:var(--dim)">
                <a href="/admin/auditoria${r.actorIpHash ? `?actor=${esc(r.actorIpHash)}` : ""}" style="color:var(--dim)">${esc(ipTail)}</a>
                · ${esc(uaShort(r.actorUa))}
              </span>
            </div>`;
          const what = r.targetLabel
            ? esc(r.targetLabel)
            : r.target
              ? `<span class="font-mono text-[11px]" style="color:var(--muted)">${esc(r.target)}</span>`
              : `<span style="color:var(--dim)">—</span>`;
          return `<tr style="border-bottom:1px solid var(--line)">
            <td style="padding:9px 10px;vertical-align:top"><span class="font-mono text-[10.5px]" style="color:var(--dim);white-space:nowrap">${esc(fmtWhen(r.at))}</span></td>
            <td style="padding:9px 10px;vertical-align:top">${who}</td>
            <td style="padding:9px 10px;vertical-align:top">
              <span class="text-[12px] text-cream">${esc(actionLabel(r.action))}</span>
              <span class="font-mono text-[9.5px]" style="color:var(--dim);display:block">${esc(r.method ?? "")} ${esc(r.action)}</span>
            </td>
            <td style="padding:9px 10px;vertical-align:top;font-size:12px;color:var(--cream)">${what}</td>
            <td style="padding:9px 10px;vertical-align:top">${diffCell(r.beforeVal, r.afterVal)}</td>
            <td style="padding:9px 10px;vertical-align:top">${resultBadge(r.result)}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:30px;font-size:13px">
         Sin registros todavía${q.action || q.text || q.actorIpHash ? " para este filtro" : ""}. Cada acción en el panel (cambiar configuración, conectar un canal, iniciar sesión…) queda aquí.
       </td></tr>`;

  const th = (t: string) =>
    `<th style="text-align:left;padding:8px 10px;color:var(--dim);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line);white-space:nowrap">${t}</th>`;

  const more =
    hasMore && oldestAt
      ? `<div style="text-align:center;margin-top:14px">
           <a href="/admin/auditoria${filterQS({ before: oldestAt })}" class="text-[12px] font-display font-semibold"
              style="border:1px solid var(--line);color:var(--cream);padding:9px 18px;text-decoration:none">Cargar más antiguas</a>
         </div>`
      : "";

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Registro de auditoría</h2>
        <p class="text-muted text-[12.5px]">
          Cada acción de un operador del panel: <b>quién</b> (huella de IP + navegador), <b>cuándo</b>, <b>qué</b> y el
          valor <b>anterior → nuevo</b>. ${total.toLocaleString("es")} registros. Esta vista es de <b>solo lectura</b>:
          no se puede editar ni borrar nada. Se conserva 180 días.
        </p>
      </div>
      ${filterBar}
      <div class="bg-panel border xscroll" style="padding:6px 8px">
        <table style="width:100%;min-width:820px;border-collapse:collapse">
          <thead><tr>${th("Cuándo")}${th("Quién")}${th("Acción")}${th("Qué cambió")}${th("Antes → Después")}${th("Resultado")}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${more}
    </div>`;

  return layout({ title: "Auditoría", activeTab: "auditoria", body, env });
}

/** CSV plano del registro (respeta los filtros — tope 500 filas más recientes). */
export async function exportAuditCsv(env: Env, q: AuditoriaQuery = {}): Promise<string> {
  const repo = new AuditRepo(new Db(env.DB));
  const rows = await repo.list({ ...q, limit: 500 }).catch(() => [] as AuditEntry[]);
  const head = ["fecha", "actor", "ip_hash", "navegador", "accion", "metodo", "ruta", "objetivo", "antes", "despues", "resultado"];
  const cell = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push(
      [
        new Date(r.at).toISOString(),
        r.actorName ?? "",
        r.actorIpHash ?? "",
        uaShort(r.actorUa),
        r.action,
        r.method ?? "",
        r.path ?? "",
        r.targetLabel ?? r.target ?? "",
        r.beforeVal ?? "",
        r.afterVal ?? "",
        r.result,
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n");
}
