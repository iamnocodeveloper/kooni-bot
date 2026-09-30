// Pestaña "Comentarios" — inbox de los comentarios de redes sociales (Zernio).
// Dos paneles, igual que Conversaciones: lista a la izquierda, detalle a la
// derecha. Muestra a qué PUBLICACIÓN pertenece el comentario, en qué
// AUTOMATIZACIÓN entró (regla o fallback) y el HILO completo, y permite
// responder en público o mandar DM desde acá.
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { CommentsRepo, type CommentRecord } from "../../db/comments";
import { CommentPostsRepo } from "../../db/commentPosts";
import { AutoRulesRepo } from "../../db/autoRules";
import { escapeHtml, ago, shortDate, initialsOf, platformColor, snippet } from "./shared";
import { fetchCommentThread, type CommentThreadItem } from "../../channels/zernioComments";
import { panelI18n, makeT, type T } from "../i18n";

function kindLabel(t: T, kind: string | null | undefined): string {
  switch (kind) {
    case "comment_dm":
      return t("com.kindCommentDm");
    case "comment_dm_public":
      return t("com.kindCommentDmPublic");
    case "comment_reply":
      return t("com.kindCommentReply");
    case "dm_reply":
      return t("com.kindDmReply");
    default:
      return kind || t("com.rule");
  }
}

const RULE_FILTERS = ["matched", "fallback", "none"] as const;
const LEG_FILTERS = ["dm", "public"] as const;

export interface CommentsParams {
  search?: string;
  /** Pill activo: matched | fallback | none | dm | public. */
  filter?: string;
  platform?: string;
  days?: number;
  selectedId?: string;
}

export function commentsParamsFrom(q: (k: string) => string | undefined): CommentsParams {
  const d = Number.parseInt(q("d") ?? "", 10);
  return {
    search: q("q") || undefined,
    filter: q("f") || undefined,
    platform: q("p") || undefined,
    days: [1, 7, 30].includes(d) ? d : undefined,
    selectedId: q("c") || undefined,
  };
}

function commentsUrl(p: CommentsParams, commentId?: string): string {
  const qs = new URLSearchParams();
  if (commentId) qs.set("c", commentId);
  if (p.filter) qs.set("f", p.filter);
  if (p.search) qs.set("q", p.search);
  if (p.platform) qs.set("p", p.platform);
  if (p.days) qs.set("d", String(p.days));
  const s = qs.toString();
  return `/admin/comentarios${s ? `?${s}` : ""}`;
}

function filtersFrom(p: CommentsParams) {
  const f = p.filter ?? "";
  return {
    rule: (RULE_FILTERS as readonly string[]).includes(f) ? (f as CommentsParams["filter"] as any) : undefined,
    leg: (LEG_FILTERS as readonly string[]).includes(f) ? (f as any) : undefined,
  };
}

const smallPill = (color: string) =>
  `font-size:9px;letter-spacing:.03em;color:${color};border:1px solid ${color};padding:1px 6px`;

function statusChips(t: T, c: CommentRecord): string {
  const chips: string[] = [];
  if (c.dmSent) chips.push(`<span style="${smallPill("var(--ok)")}">${t("com.chipDmSent")}</span>`);
  if (c.publicReplySent) chips.push(`<span style="${smallPill("var(--accent)")}">${t("com.chipPublicReply")}</span>`);
  if (c.ruleId) chips.push(`<span style="${smallPill("var(--linelit)")}">${t("com.chipRule")}</span>`);
  else if (c.publicReplySent) chips.push(`<span style="${smallPill("var(--muted)")}">${t("com.chipFallback")}</span>`);
  else chips.push(`<span style="font-size:9px;color:var(--dim)">${t("com.chipNoAutomation")}</span>`);
  return chips.join(" ");
}

function authorLabel(c: CommentRecord): string {
  return c.authorName || c.authorUsername || "—";
}

// --- Left pane: list ---------------------------------------------------------

export async function renderComentariosList(env: Env, p: CommentsParams): Promise<string> {
  const { t } = await panelI18n(env);
  const repo = new CommentsRepo(new Db(env.DB));
  const { rule, leg } = filtersFrom(p);
  let rows: CommentRecord[] = [];
  let posts = new Map<string, string>();
  try {
    rows = await repo.list({ search: p.search, platform: p.platform, rule, leg, days: p.days, limit: 60 });
    // Caption del post para la vista previa (una sola pasada por los post_ids).
    const postRepo = new CommentPostsRepo(new Db(env.DB));
    const ids = [...new Set(rows.map((r) => r.postId).filter(Boolean))] as string[];
    const entries = await Promise.all(ids.map(async (id) => [id, await postRepo.get(id).catch(() => null)] as const));
    posts = new Map(entries.filter(([, v]) => v?.caption).map(([id, v]) => [id, v!.caption as string]));
  } catch (e) {
    console.warn("[comentarios] no se pudieron cargar:", e);
  }

  if (rows.length === 0) {
    return `<div style="padding:32px 16px;text-align:center;font-size:12.5px;color:var(--dim)">${p.filter || p.search ? t("com.noCommentsFiltered") : t("com.noComments")}</div>`;
  }

  return rows
    .map((c) => {
      const selected = c.id === p.selectedId;
      const initials = initialsOf(authorLabel(c));
      const color = platformColor(c.platform);
      const postCaption = c.postId ? posts.get(c.postId) : undefined;
      return `
      <a href="${commentsUrl(p, c.id)}" class="convrow" style="display:flex;gap:11px;padding:12px 14px;border-bottom:1px solid var(--line);cursor:pointer;${selected ? "background:var(--panel2);border-left:2px solid var(--accent)" : "border-left:2px solid transparent"}">
        <div style="width:34px;height:34px;flex:none;background:var(--raise);border:1px solid var(--linelit);display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;color:${color}">${escapeHtml(initials)}</div>
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12.5px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:var(--cream)">${escapeHtml(authorLabel(c))}</span>
            <span style="font-size:9px;letter-spacing:.05em;color:${color};border:1px solid ${color};padding:0 5px;flex:none">${escapeHtml(c.platform)}</span>
            <span style="margin-left:auto;font-size:9.5px;color:var(--dim);white-space:nowrap">${ago(c.createdAt, t)}</span>
          </div>
          <div style="font-size:11.5px;color:var(--cream);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin-top:3px">${escapeHtml(snippet(c.text, 70)) || "—"}</div>
          ${postCaption ? `<div style="font-size:10.5px;color:var(--dim);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin-top:3px">📷 ${escapeHtml(snippet(postCaption, 60))}</div>` : ""}
          <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">${statusChips(t, c)}</div>
        </div>
      </a>`;
    })
    .join("");
}

// --- Right pane: detail ------------------------------------------------------

interface DmLogRow {
  kind: string;
  status: string;
  error: string | null;
  created_at: number;
}

async function loadDmLogs(env: Env, commentId: string): Promise<DmLogRow[]> {
  try {
    return await new Db(env.DB).all<DmLogRow>(
      "SELECT kind, status, error, created_at FROM dm_logs WHERE target = ? ORDER BY created_at DESC LIMIT 8",
      [commentId],
    );
  } catch {
    return [];
  }
}

async function conversationLink(env: Env, c: CommentRecord, t: T): Promise<string> {
  if (!c.authorId) return "";
  const convId = `zernio:${c.accountId ?? ""}:${c.authorId}`;
  try {
    const row = await new Db(env.DB).first<{ id: string }>("SELECT id FROM conversations WHERE id = ?", [convId]);
    if (!row) return "";
    return `<a href="/admin/conversations?c=${encodeURIComponent(convId)}" style="font-size:11.5px;color:var(--accent);text-decoration:underline">${t("com.viewDmConv")}</a>`;
  } catch {
    return "";
  }
}

function threadItemsHtml(items: CommentThreadItem[], rootId: string, t: T): string {
  const replies = items.filter((i) => i.id !== rootId);
  if (replies.length === 0) return "";
  return replies
    .map((r) => {
      const who = r.author.isOwner ? t("com.us") : r.author.name || r.author.username || "—";
      const color = r.author.isOwner ? "var(--accent)" : "var(--accent-2)";
      return `<div style="margin-top:8px;padding-left:10px;border-left:2px solid ${color}">
        <div style="font-size:11px;color:${color};font-weight:600">${escapeHtml(who)}${r.isHidden ? " · " + t("com.hidden") : ""}</div>
        <div style="font-size:12.5px;color:var(--cream);white-space:pre-wrap">${escapeHtml(r.text)}</div>
        ${r.createdTime ? `<div style="font-size:10px;color:var(--dim)">${escapeHtml(r.createdTime)}</div>` : ""}
      </div>`;
    })
    .join("");
}

export function renderComposeBox(id: string, prefill = "", t: T = makeT("es")): string {
  return `
    <textarea id="comment-compose-text" name="text" rows="3" placeholder="${t("com.composePlaceholder")}"
      style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--cream);font-size:12.5px;padding:9px 11px;font-family:inherit">${escapeHtml(prefill)}</textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <button class="bigbtn" hx-post="/admin/comentarios/${encodeURIComponent(id)}/reply" hx-include="#comment-compose-text" hx-target="#comment-detail" hx-swap="innerHTML" style="font-size:12px">${t("com.replyPublic")}</button>
      <button class="ghostbtn" hx-post="/admin/comentarios/${encodeURIComponent(id)}/dm" hx-include="#comment-compose-text" hx-target="#comment-detail" hx-swap="innerHTML" style="font-size:12px">${t("com.sendDm")}</button>
      <button class="ghostbtn" hx-post="/admin/comentarios/${encodeURIComponent(id)}/suggest" hx-target="#comment-compose" hx-swap="innerHTML" style="font-size:12px">${t("com.generateAi")}</button>
    </div>`;
}

export async function renderComentarioThread(
  env: Env,
  id: string,
  notice?: { type: "ok" | "error"; text: string },
): Promise<string> {
  const { t } = await panelI18n(env);
  const repo = new CommentsRepo(new Db(env.DB));
  let c: CommentRecord | null = null;
  try {
    c = await repo.getById(id);
  } catch (e) {
    console.warn("[comentarios] detalle no disponible:", e);
  }
  if (!c) {
    return `<div style="padding:32px;text-align:center;color:var(--dim);font-size:12.5px">${t("com.pickOne")}</div>`;
  }

  const noticeHtml = notice
    ? `<div style="padding:8px 11px;border:1px solid ${notice.type === "ok" ? "var(--ok)" : "var(--bad)"};color:${notice.type === "ok" ? "var(--ok)" : "var(--bad)"};font-size:12px">${escapeHtml(notice.text)}</div>`
    : "";

  // Publicación: de la caché (comment_posts) o traída de Zernio (best-effort).
  const postRepo = new CommentPostsRepo(new Db(env.DB));
  let post = c.postId ? await postRepo.get(c.postId).catch(() => null) : null;
  let thread: CommentThreadItem[] = [];
  if (c.postId) {
    try {
      const threadRes = await fetchCommentThread(env, { accountId: c.accountId, postId: c.postId, commentId: c.id });
      thread = threadRes.comments;
      if (threadRes.post) {
        post = { ...(post ?? {}), ...threadRes.post, fetchedAt: Date.now() } as any;
        await postRepo
          .upsert({
            postId: threadRes.post.postId,
            platformPostId: threadRes.post.platformPostId,
            platform: threadRes.post.platform ?? c.platform,
            accountId: c.accountId,
            caption: threadRes.post.caption,
            permalink: threadRes.post.permalink,
            picture: threadRes.post.picture,
          })
          .catch(() => {});
      }
    } catch (e) {
      console.warn("[comentarios] no se pudo leer el hilo de Zernio:", e);
    }
  }

  // Automatización: regla que disparó, fallback, o ninguna.
  let ruleHtml = `<span style="color:var(--dim);font-size:12px">${t("com.ruleNone")}</span>`;
  if (c.ruleId) {
    try {
      const rule = await new AutoRulesRepo(new Db(env.DB)).get(c.ruleId);
      const kws = (rule?.keywords ?? []).map((k: string) => `"${escapeHtml(k)}"`).join(", ");
      ruleHtml = `
        <div style="font-size:12.5px;color:var(--cream)">${escapeHtml(kindLabel(t, rule?.kind ?? ""))}</div>
        ${kws ? `<div style="font-size:11.5px;color:var(--muted);margin-top:2px">${t("com.keywords")}: ${kws}</div>` : ""}
        <div style="font-family:var(--mono);font-size:10px;color:var(--dim);margin-top:2px">${escapeHtml(c.ruleId)}</div>`;
    } catch {
      ruleHtml = `<div style="font-size:12px;color:var(--muted)">${t("com.rule")} ${escapeHtml(c.ruleId)}</div>`;
    }
  } else if (c.publicReplySent) {
    ruleHtml = `<span style="color:var(--muted);font-size:12px">${t("com.fallbackReply")}</span>`;
  }

  const logs = await loadDmLogs(env, c.id);
  const logsHtml = logs.length
    ? logs
        .map(
          (l) =>
            `<div style="font-size:11px;color:var(--muted);display:flex;gap:8px"><span style="font-family:var(--mono);color:var(--dim)">${escapeHtml(shortDate(l.created_at))}</span><span>${escapeHtml(l.kind)} · ${escapeHtml(l.status)}${l.error ? ` · ${escapeHtml(snippet(l.error, 90))}` : ""}</span></div>`,
        )
        .join("")
    : `<div style="font-size:11px;color:var(--dim)">${t("com.noEvents")}</div>`;

  const convLink = await conversationLink(env, c, t);
  const permalink = post?.permalink
    ? `<a href="${escapeHtml(post.permalink)}" target="_blank" rel="noreferrer" style="font-size:11.5px;color:var(--accent);text-decoration:underline">${t("com.openPost")}</a>`
    : "";
  const postCard = `
    <div style="margin-top:10px;padding:10px 12px;background:var(--panel2);border:1px solid var(--line)">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim)">${t("com.postLabel")}</div>
      <div style="font-size:12.5px;color:var(--cream);margin-top:4px;white-space:pre-wrap">${escapeHtml(post?.caption ?? t("com.noCaption"))}</div>
      <div style="display:flex;gap:12px;margin-top:6px">${permalink}${c.postId ? `<span style="font-family:var(--mono);font-size:10px;color:var(--dim)">${escapeHtml(c.postId)}</span>` : ""}</div>
    </div>`;

  return `
    <div style="display:flex;flex-direction:column;gap:12px">
      ${noticeHtml}
      <div style="display:flex;align-items:center;gap:9px">
        <div style="width:38px;height:38px;background:var(--raise);border:1px solid var(--linelit);display:flex;align-items:center;justify-content:center;font-weight:700;color:${platformColor(c.platform)}">${escapeHtml(initialsOf(authorLabel(c)))}</div>
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--cream)">${escapeHtml(authorLabel(c))}</div>
          <div style="font-size:11px;color:var(--dim)">${escapeHtml(c.platform)}${c.authorUsername ? ` · @${escapeHtml(c.authorUsername)}` : ""} · ${escapeHtml(shortDate(c.createdAt))}</div>
        </div>
      </div>

      <div style="padding:12px 14px;background:var(--panel);border:1px solid var(--line)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim)">${t("com.commentLabel")}</div>
        <div style="font-size:13px;color:var(--cream);margin-top:5px;white-space:pre-wrap">${escapeHtml(c.text ?? t("com.noText"))}</div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${statusChips(t, c)}</div>
        ${c.publicReplyText ? `<div style="margin-top:8px;padding-left:10px;border-left:2px solid var(--accent)"><div style="font-size:10px;color:var(--accent)">${t("com.ourPublicReply")}</div><div style="font-size:12.5px;color:var(--cream);white-space:pre-wrap">${escapeHtml(c.publicReplyText)}</div></div>` : ""}
        ${threadItemsHtml(thread, c.id, t)}
      </div>

      ${postCard}

      <div style="padding:10px 12px;background:var(--panel2);border:1px solid var(--line)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim)">${t("com.automationEntered")}</div>
        <div style="margin-top:5px">${ruleHtml}</div>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:3px">${logsHtml}</div>
      </div>

      ${convLink ? `<div>${convLink}</div>` : ""}

      <div id="comment-compose" style="padding:10px 12px;background:var(--panel);border:1px solid var(--line)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);margin-bottom:6px">${t("com.replyLabel")}</div>
        ${renderComposeBox(c.id, "", t)}
      </div>
    </div>`;
}

// --- Full page ---------------------------------------------------------------

export async function renderComentarios(env: Env, p: CommentsParams): Promise<string> {
  const { t } = await panelI18n(env);
  const repo = new CommentsRepo(new Db(env.DB));
  let counts = { total: 0, matched: 0, fallback: 0, none: 0, dm: 0, publicReply: 0 };
  let list = "";
  try {
    counts = await repo.counts();
    list = await renderComentariosList(env, p);
  } catch (e) {
    console.warn("[comentarios] load falló:", e);
  }

  const pill = (key: string, label: string, n?: number) => {
    const active = (p.filter ?? "") === key;
    const href = commentsUrl({ ...p, filter: key || undefined }, p.selectedId);
    const color = active ? "var(--accent)" : "var(--muted)";
    return `<a href="${href}" style="font-size:11px;color:${color};border:1px solid ${color};padding:3px 9px;text-decoration:none">${escapeHtml(label)}${n != null ? ` ${n}` : ""}</a>`;
  };

  const right = p.selectedId
    ? await renderComentarioThread(env, p.selectedId)
    : `<div style="padding:32px;text-align:center;color:var(--dim);font-size:12.5px">${t("com.pickOneDetail")}</div>`;

  const body = `
    <div class="inbox" data-view="${p.selectedId ? "thread" : "list"}" style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <div class="font-display font-semibold text-[15px] text-cream">${t("com.title")}</div>
        <p class="text-muted text-[12.5px]">${t("com.subtitle", { n: counts.total })}</p>
      </div>

      <div class="inbox-filters" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${pill("", t("com.filterAll"), counts.total)}
        ${pill("matched", t("com.filterMatched"), counts.matched)}
        ${pill("fallback", t("com.filterFallback"), counts.fallback)}
        ${pill("none", t("com.filterNone"), counts.none)}
        ${pill("dm", t("com.filterDm"), counts.dm)}
        ${pill("public", t("com.filterPublic"), counts.publicReply)}
        <form method="get" action="/admin/comentarios" style="margin-left:auto;display:flex;gap:6px">
          <input name="q" value="${escapeHtml(p.search ?? "")}" placeholder="${t("com.searchPlaceholder")}" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);font-size:12px;padding:4px 9px" />
          <select name="p" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);font-size:12px;padding:4px 9px">
            <option value="">${t("com.allPlatforms")}</option>
            ${["instagram", "facebook", "threads", "tiktok", "youtube", "linkedin", "reddit", "bluesky"]
              .map((pl) => `<option value="${pl}" ${p.platform === pl ? "selected" : ""}>${pl}</option>`)
              .join("")}
          </select>
          <button class="ghostbtn" style="font-size:12px">${t("com.filterBtn")}</button>
        </form>
      </div>

      <div class="inbox-grid grid grid-cols-1 md:grid-cols-[340px_1fr] overflow-hidden" style="border:1px solid var(--line);background:var(--panel);min-height:420px">
        <div class="inbox-list" style="border-right:1px solid var(--line);overflow-y:auto;max-height:calc(100vh - 300px)">
          <div id="comment-list" hx-get="/admin/comentarios/list-fragment?${new URLSearchParams({ ...(p.filter ? { f: p.filter } : {}), ...(p.search ? { q: p.search } : {}), ...(p.platform ? { p: p.platform } : {}), ...(p.days ? { d: String(p.days) } : {}), ...(p.selectedId ? { c: p.selectedId } : {}) }).toString()}" hx-trigger="every 10s[window.puedeRefrescar('comment-list')]" hx-swap="innerHTML">${list}</div>
        </div>
        <div class="inbox-pane" style="overflow-y:auto;max-height:calc(100vh - 300px);padding:16px">
          <div id="comment-detail" hx-get="${p.selectedId ? `/admin/comentarios/thread/${encodeURIComponent(p.selectedId)}` : ""}" hx-trigger="every 30s[window.puedeRefrescar('comment-detail')]" hx-swap="innerHTML">${right}</div>
        </div>
      </div>
    </div>`;

  return layout({ title: t("com.title"), activeTab: "comentarios", body, env });
}
