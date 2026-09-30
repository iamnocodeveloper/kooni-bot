import type { Env } from "../env";
import { resolveZernioCredentials } from "./zernioCredentials";

/**
 * Llamadas de COMENTARIOS contra la API de Zernio, centralizadas para que las
 * use tanto la automatización (`src/channels/zernio.ts`) como el inbox del panel
 * (`src/admin`). Antes estas URLs estaban duplicadas dentro de `sendCommentActions`.
 *
 *   API base: https://zernio.com/api  (configurable con ZERNIO_API_BASE_URL)
 *   Leer:     GET  /v1/inbox/comments/{postId}?accountId=&commentId=
 *   Público:  POST /v1/inbox/comments/{postId}                         body { accountId, message, commentId }
 *   DM:       POST /v1/inbox/comments/{postId}/{commentId}/private-reply body { accountId, message, buttons? }
 */
const DEFAULT_BASE = "https://zernio.com/api";
const TIMEOUT_MS = 15_000;

/**
 * Tope de seguridad: máximo de respuestas públicas por cuenta en 24 h (rolling).
 * Lo comparten la automatización (`sendCommentActions`) y la respuesta manual
 * del panel, para que ni el bot ni el dueño puedan inundar el público.
 */
export const MAX_PUBLIC_REPLIES_PER_DAY = 200;

function zernioBase(env: Env): string {
  return env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
}

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim() !== "") return v.trim();
  return undefined;
}

export interface PostContext {
  postId: string;
  platformPostId?: string;
  platform?: string;
  caption?: string;
  permalink?: string;
  picture?: string;
}

export interface CommentThreadItem {
  id: string;
  text: string;
  createdTime?: string;
  author: { id?: string; name?: string; username?: string; picture?: string; isOwner?: boolean };
  likeCount?: number;
  isHidden?: boolean;
  canReply?: boolean;
}

export interface CommentThread {
  post: PostContext | null;
  comments: CommentThreadItem[];
}

export interface CommentActionResult {
  ok: boolean;
  status: number;
  error?: string;
  /** La private reply de ese comentario ya se había usado (Meta permite UNA). */
  consumed?: boolean;
}

/** Mapea el objeto `post` de Zernio (webhook o endpoint de lectura) a PostContext. */
export function extractPostContext(raw: unknown, fallbackPostId?: string): PostContext | null {
  const post = raw as Record<string, unknown> | null | undefined;
  if (!post || typeof post !== "object") return null;
  const id = pickStr(post.id, post.postId, post.platformPostId, fallbackPostId);
  if (!id) return null;
  return {
    postId: id,
    platformPostId: pickStr(post.platformPostId),
    platform: pickStr(post.platform),
    caption: pickStr(post.content, post.caption, post.text, post.title, post.selftext),
    permalink: pickStr(post.permalink, post.url, post.platformPostUrl),
    picture: pickStr(post.picture, post.thumbnail, post.image, post.mediaUrl),
  };
}

function mapThreadItem(raw: unknown): CommentThreadItem | null {
  const c = raw as Record<string, any> | null | undefined;
  const id = pickStr(c?.id, c?.commentId);
  if (!id) return null;
  const from = (c?.from ?? c?.author ?? {}) as Record<string, any>;
  return {
    id,
    text: pickStr(c?.message, c?.text, c?.body) ?? "",
    createdTime: pickStr(c?.createdTime, c?.timestamp, c?.created_at),
    author: {
      id: pickStr(from.id),
      name: pickStr(from.name),
      username: pickStr(from.username),
      picture: pickStr(from.picture),
      isOwner: from.isOwner === true,
    },
    likeCount: typeof c?.likeCount === "number" ? c.likeCount : undefined,
    isHidden: c?.isHidden === true,
    canReply: c?.canReply === true ? true : undefined,
  };
}

/**
 * Trae el hilo de un comentario (raíz + respuestas, incluidas las nuestras) y el
 * post al que pertenece. `commentId` limita a las respuestas de ese comentario.
 * Best-effort: ante error devuelve vacío (el panel ya muestra lo que hay en D1).
 */
export async function fetchCommentThread(
  env: Env,
  opts: { accountId?: string; postId: string; commentId?: string; limit?: number },
): Promise<CommentThread> {
  const { apiKey } = await resolveZernioCredentials(env);
  if (!apiKey || !opts.postId) return { post: null, comments: [] };
  const qs = new URLSearchParams({ limit: String(opts.limit ?? 50) });
  if (opts.accountId) qs.set("accountId", opts.accountId);
  if (opts.commentId) qs.set("commentId", opts.commentId);
  try {
    const res = await fetch(
      `${zernioBase(env)}/v1/inbox/comments/${encodeURIComponent(opts.postId)}?${qs.toString()}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return { post: null, comments: [] };
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    const post = extractPostContext(json?.post, opts.postId);
    const comments = Array.isArray(json?.comments)
      ? (json.comments.map(mapThreadItem).filter(Boolean) as CommentThreadItem[])
      : [];
    return { post, comments };
  } catch (e) {
    console.warn("[zernioComments] no se pudo leer el hilo:", e);
    return { post: null, comments: [] };
  }
}

async function readError(res: Response): Promise<string> {
  let body = "";
  try {
    const json = (await res.clone().json()) as any;
    body = pickStr(json?.error, json?.message, json?.detail) ?? JSON.stringify(json);
  } catch {
    body = (await res.text().catch(() => "")) || "";
  }
  return (body || `HTTP ${res.status}`).slice(0, 300);
}

/** Responde en público a un comentario (con Idempotency-Key, como sugiere Zernio). */
export async function replyToComment(
  env: Env,
  opts: { accountId?: string; postId: string; commentId: string; message: string },
): Promise<CommentActionResult> {
  const { apiKey } = await resolveZernioCredentials(env);
  if (!apiKey) return { ok: false, status: 0, error: "ZERNIO_API_KEY no configurada" };
  if (!opts.postId || !opts.commentId || !opts.message.trim()) {
    return { ok: false, status: 0, error: "datos incompletos" };
  }
  try {
    const res = await fetch(
      `${zernioBase(env)}/v1/inbox/comments/${encodeURIComponent(opts.postId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `${opts.postId}:${opts.commentId}:public`,
        },
        body: JSON.stringify({
          accountId: opts.accountId,
          message: opts.message,
          commentId: opts.commentId,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: await readError(res) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Manda la private reply (DM) al comentarista. Meta solo permite UNA por
 * comentario y por 7 días: si ya se usó, devuelve `consumed: true` (no es un
 * error del bot, es una regla de la plataforma).
 */
export async function privateReplyToComment(
  env: Env,
  opts: { accountId?: string; postId: string; commentId: string; message: string; buttons?: unknown[] },
): Promise<CommentActionResult> {
  const { apiKey } = await resolveZernioCredentials(env);
  if (!apiKey) return { ok: false, status: 0, error: "ZERNIO_API_KEY no configurada" };
  if (!opts.postId || !opts.commentId || !opts.message.trim()) {
    return { ok: false, status: 0, error: "datos incompletos" };
  }
  try {
    const res = await fetch(
      `${zernioBase(env)}/v1/inbox/comments/${encodeURIComponent(opts.postId)}/${encodeURIComponent(opts.commentId)}/private-reply`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `${opts.postId}:${opts.commentId}:private`,
        },
        body: JSON.stringify({
          accountId: opts.accountId,
          message: opts.message,
          buttons: opts.buttons?.length ? opts.buttons : undefined,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.ok) return { ok: true, status: res.status };
    let consumed = false;
    try {
      const json = (await res.clone().json()) as any;
      consumed =
        json?.details?.privateReplyConsumed === true ||
        /private reply/i.test(String(json?.error ?? json?.message ?? ""));
    } catch {
      /* sin JSON */
    }
    return { ok: false, status: res.status, error: await readError(res), consumed };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
