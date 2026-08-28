// Zernio — proveedor unificado multicanal (Instagram, Facebook/Messenger, X,
// Telegram, WhatsApp, Bluesky, Reddit…) con UNA api key y OAuth de un clic.
// Canal "tipo ManyChat": webhook entrante + API REST de envío.
//
//   API base: https://zernio.com/api  (configurable con ZERNIO_API_BASE_URL)
//   Enviar:   POST /v1/inbox/conversations/{conversationId}/messages
//             body { accountId, message?, buttons? } — Bearer ZERNIO_API_KEY
//   Webhook:  firma HMAC-SHA256 (hex) en header X-Zernio-Signature
//             (o legacy X-Late-Signature), secreto ZERNIO_WEBHOOK_SECRET.
//
// Eventos que maneja este adapter:
//   • message.received  → DM entrante de cualquier plataforma → al agente.
//   • comment.received  → comentario en un post. Si ZERNIO_AUTO_DM_KEYWORD
//     aparece en el texto (case-insensitive), responde al autor con
//     ZERNIO_AUTO_DM_MESSAGE + botón opcional (ZERNIO_AUTO_DM_BUTTON_URL/
//     ZERNIO_AUTO_DM_BUTTON_LABEL). El comentario NO entra al agente.
//   • reaction.received → ack, se ignora.
//
// Referencia del adapter oficial (Chat SDK): github.com/zernio-dev/chat-sdk-adapter

import type { ChannelAdapter, IncomingMessage, OutgoingReply, ChannelId } from "./shared";
import type { Env } from "../env";
import { matchKeywords, renderUsername } from "../utils/keyword-matcher";
import { resolveZernioCredentials } from "./zernioCredentials";

const DEFAULT_BASE = "https://zernio.com/api";

export function zernioChannel(): ChannelId {
  return "zernio";
}

// ─── Firma del webhook ───────────────────────────────────────────────────────
// Zernio firma el body crudo con HMAC-SHA256 y manda el digest hex en
// X-Zernio-Signature (legacy: X-Late-Signature). Comparación en tiempo
// constante para evitar timing attacks.
export async function verifyZernioSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== signature.length) return false;
  // Comparación de igual longitud (ambos hex) — evita el cortocircuito por longitud.
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Payloads ────────────────────────────────────────────────────────────────
interface ZernioMessage {
  id?: string;
  conversationId?: string;
  platform?: string;
  direction?: string;
  text?: string | null;
  attachments?: { type?: string; url?: string }[];
  sender?: { id?: string; name?: string; username?: string };
  sentAt?: string;
}

interface ZernioComment {
  id?: string;
  postId?: string;
  platformPostId?: string;
  platform?: string;
  text?: string | null;
  author?: { id?: string; username?: string; name?: string; picture?: string };
  isReply?: boolean;
  parentCommentId?: string | null;
}

interface ZernioWebhookBody {
  id?: string;
  event?: string;
  timestamp?: string;
  message?: ZernioMessage;
  conversation?: { id?: string; platformConversationId?: string; participantName?: string; participantUsername?: string };
  account?: { id?: string; accountId?: string; profileId?: string; platform?: string; username?: string; displayName?: string };
  comment?: ZernioComment;
}

function firstUrl(body: { attachments?: { type?: string; url?: string }[] }): { audio?: string; image?: string } {
  let audio: string | undefined;
  let image: string | undefined;
  for (const a of body.attachments ?? []) {
    const url = a.url ?? "";
    if (!url) continue;
    const t = (a.type ?? "").toLowerCase();
    if (t === "audio" || t === "video" || /\.(mp3|mp4|m4a|ogg|webm|amr)(\?|#|$)/i.test(url)) audio = url;
    else if (t === "image" || /\.(jpe?g|png|gif|webp|heic)(\?|#|$)/i.test(url)) image = url;
  }
  return { audio, image };
}

// ─── Flujos de automatización (comentarios + DMs) ────────────────────────────
// Reglas editables desde el panel /admin/flujos (tabla D1 auto_rules). Si un
// comentario o DM matchea una regla activa, la regla GANA (respuesta
// automática) y el mensaje no entra al agente. Las vars ZERNIO_AUTO_DM_*
// siguen funcionando como fallback (modo simple) si no hay reglas en D1.
//
// Endpoints (API pública de Zernio):
//   DM:      POST /v1/inbox/comments/{postId}/{commentId}/private-reply
//            (IG y FB; una respuesta por comentario, dentro de 7 días)
//   Público: POST /v1/inbox/comments/{postId}  body { accountId, message, commentId }
interface AutoDmRule {
  keywords: string[];
  message: string;
  buttonLabel?: string;
  buttonUrl?: string;
  /** Respuesta pública al comentario (opcional). Si va vacío, no se responde en público. */
  replyToComment?: string;
  /** Prompt para que la IA genere la respuesta pública en el tono del dueño. */
  aiReplyPrompt?: string;
  /** true = palabra completa (default); false = match parcial. */
  wholeWordMatch?: boolean;
  /** ID de la regla en D1 (para trackear links). */
  ruleId?: string;
  /** Follow gate: exige follow antes de entregar el link (port OpenReply). */
  requireFollow?: boolean;
  followPromptMessage?: string;
  followButtonLabel?: string;
}

/** Carga las reglas desde D1 (panel) o cae a las vars de env (modo simple). */
async function loadAutoDmRules(env: Env): Promise<AutoDmRule[]> {
  // 1) Reglas del panel (auto_rules en D1) — prioridad.
  try {
    const { Db } = await import("../db/client");
    const { AutoRulesRepo } = await import("../db/autoRules");
    const rules = await new AutoRulesRepo(new Db(env.DB)).list({ onlyActive: true });
    const mapped: AutoDmRule[] = rules
      .filter((r) => r.kind === "comment_dm" || r.kind === "comment_reply")
      .map((r) => ({
        ruleId: r.id,
        keywords: r.keywords,
        message: r.message,
        buttonLabel: r.buttonLabel,
        buttonUrl: r.buttonUrl,
        replyToComment: r.replyToComment,
        aiReplyPrompt: r.aiReplyPrompt,
        wholeWordMatch: r.wholeWordMatch,
        requireFollow: r.requireFollow,
        followPromptMessage: r.followPromptMessage,
        followButtonLabel: r.followButtonLabel,
      }));
    if (mapped.length > 0) return mapped;
  } catch (e) {
    console.warn("[zernio] no se pudieron cargar reglas de D1:", e);
  }

  // 2) ZERNIO_AUTO_DM_RULES (JSON) — modo avanzado por env.
  const rules: AutoDmRule[] = [];
  try {
    const raw = (env.ZERNIO_AUTO_DM_RULES ?? "").trim();
    if (raw) {
      const parsed = JSON.parse(raw) as AutoDmRule[];
      for (const r of parsed) {
        const kws = (r.keywords ?? []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
        const msg = (r.message ?? "").trim();
        if (kws.length > 0 && msg) {
          rules.push({ keywords: kws, message: msg, buttonLabel: r.buttonLabel, buttonUrl: r.buttonUrl, replyToComment: r.replyToComment, aiReplyPrompt: r.aiReplyPrompt, wholeWordMatch: r.wholeWordMatch, requireFollow: r.requireFollow, followPromptMessage: r.followPromptMessage, followButtonLabel: r.followButtonLabel });
        }
      }
    }
  } catch (e) {
    console.error("[zernio] ZERNIO_AUTO_DM_RULES JSON inválido:", e);
  }
  if (rules.length > 0) return rules;

  // 3) Modo simple legacy (una sola keyword).
  const legacyKw = (env.ZERNIO_AUTO_DM_KEYWORD ?? "").trim().toLowerCase();
  if (legacyKw) {
    rules.push({
      keywords: [legacyKw],
      message:
        env.ZERNIO_AUTO_DM_MESSAGE?.trim() ||
        "¡Hola! 👋 Gracias por tu interés. Aquí tienes la información que pediste:",
      buttonLabel: env.ZERNIO_AUTO_DM_BUTTON_LABEL,
      buttonUrl: env.ZERNIO_AUTO_DM_BUTTON_URL,
    });
  }
  return rules;
}

async function sendCommentActions(
  matched: AutoDmRule,
  accountId: string,
  postId: string,
  commentId: string,
  commenterName: string | null | undefined,
  commenterId: string | undefined,
  commentText: string | undefined,
  env: Env,
): Promise<void> {
  const { apiKey } = await resolveZernioCredentials(env);
  if (!apiKey) return;
  const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  // Trackear el link del botón: si la regla tiene buttonUrl, lo servimos vía
  // /r/:slug (cuenta clicks) en vez del URL crudo.
  let buttonUrl = matched.buttonUrl;
  if (buttonUrl && matched.ruleId) {
    try {
      const { Db } = await import("../db/client");
      const { TrackedLinksRepo } = await import("../db/trackedLinks");
      const link = await new TrackedLinksRepo(new Db(env.DB)).ensureForRule(matched.ruleId, buttonUrl, matched.buttonLabel);
      const baseUrl = (env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");
      buttonUrl = `${baseUrl}/r/${link.slug}`;
    } catch (e) {
      console.warn("[zernio] no se pudo trackear el link:", e);
      // sin tracking: se usa el URL crudo
    }
  }

  const buttons: { type: string; title: string; url?: string; payload?: string }[] = [];
  if (buttonUrl) {
    buttons.push({
      type: "url",
      title: matched.buttonLabel?.trim() || "Abrir",
      url: buttonUrl,
    });
  }

  const dmMessage = renderUsername(matched.message, commenterName);
  // Respuesta pública: fija (replyToComment) o generada con IA (aiReplyPrompt).
  let publicReply = matched.replyToComment?.trim()
    ? renderUsername(matched.replyToComment.trim(), commenterName)
    : undefined;
  if (!publicReply && matched.aiReplyPrompt?.trim()) {
    try {
      const { generateAiPublicReply } = await import("../aiReply");
      const generated = await generateAiPublicReply(env, {
        prompt: matched.aiReplyPrompt,
        commentText,
        commenterName,
        businessName: env.BUSINESS_NAME,
        keyword: matched.keywords?.[0],
      });
      if (generated) publicReply = renderUsername(generated, commenterName);
    } catch (e) {
      console.warn("[zernio] generación IA de respuesta pública falló:", e);
    }
  }

  // ── Follow gate (port OpenReply) ──────────────────────────────────────────
  // Si la regla exige follow, verificamos si el autor sigue la cuenta ANTES de
  // entregar el link. Si NO sigue: enviamos un DM de "sígueme" con botón
  // postback (followcheck) en vez del link; cuando toque el botón, el webhook
  // message.received traerá el payload y entregaremos el link (ver autoReplyOnDm).
  let followGated = false;
  if (matched.requireFollow && commenterId) {
    try {
      const followRes = await fetch(
        `${base}/v1/accounts/${encodeURIComponent(accountId)}/follow-status/${encodeURIComponent(commenterId)}`,
        { headers, signal: AbortSignal.timeout(6000) },
      );
      if (followRes.ok) {
        const fj = (await followRes.json()) as { isFollower?: boolean | null };
        followGated = fj.isFollower !== true; // null/unknown → pedir confirmación
      } else {
        console.warn(`[zernio] follow-status falló: ${followRes.status}`);
        followGated = true; // no sabemos → pedir confirmación (fail-closed)
      }
    } catch (e) {
      console.warn("[zernio] follow-status error:", e);
      followGated = true;
    }
  }

  // Estados FINALES honestos para el historial: sent = se envió de verdad en
  // este intento · skipped = dedup/ya enviado antes · failed = error real.
  let dmSent = false;
  let dmSkipped = false;
  let dmError: string | undefined;
  let publicSent = false;
  let publicSkipped = false;
  let publicError: string | undefined;

  // ── Dedup SEPARADO por pierna (fix: no saltar la pública si el DM ya fue) ──
  // Meta permite UNA private reply por comentario. Si el DM ya se envió (en
  // CUALQUIER regla o intento previo), NO re-enviamos el DM, PERO sí intentamos
  // la respuesta pública si aún no se publicó (un intento previo pudo fallar a
  // mitad). El error 400 "ya se ha enviado una respuesta privada" de Instagram
  // se trata como caso esperado (el DM ya fue) → skipped para no marcarlo fail.
  let dmAlreadySent = false;
  let publicAlreadySent = false;
  try {
    const { Db } = await import("../db/client");
    const { DmLogsRepo } = await import("../db/dmLogs");
    const logs = new DmLogsRepo(new Db(env.DB));
    const rec = await logs.getProcessedComment(commentId);
    dmAlreadySent = rec?.dmSentAt != null;
    publicAlreadySent = rec?.publicReplySentAt != null;

    // Rate limit por cuenta (Fase 5): si el DM NO se ha enviado aún, reservamos
    // slot. Si ya se envió, no gastamos cupo (solo reintentamos la pública).
    if (!dmAlreadySent && !(await logs.reserveDmSlot(accountId))) {
      const { used, windowStart } = await logs.currentHourUsage(accountId);
      console.warn(`[zernio] rate limit: cuenta ${accountId} agotó su cupo (${used}/hora) — se salta DM`);
      await logs.log({
        ruleId: matched.ruleId,
        kind: "comment_dm",
        platform: "instagram",
        target: commentId,
        username: commenterName ?? undefined,
        message: dmMessage,
        status: "skipped",
        error: `Rate limit: la cuenta agotó su cupo de esta hora (${used} DM). Ventana: ${new Date(windowStart + 3600_000).toISOString()}`,
      });
      dmAlreadySent = true; // no reintentar DM; intentar pública igual
      dmSkipped = true;
    }

    // Límite free de DMs automáticos / mes (solo si aún no se envió el DM).
    if (!dmAlreadySent) {
      try {
        const { checkLimit } = await import("../limits");
        const dmCheck = await checkLimit(env, "autoDmsThisMonth");
        if (!dmCheck.allowed) {
          console.warn(`[limits] DMs automáticos al tope (${dmCheck.used}/${dmCheck.limit}) — se salta DM`);
          await logs.log({
            ruleId: matched.ruleId,
            kind: "comment_dm",
            platform: "instagram",
            target: commentId,
            username: commenterName ?? undefined,
            message: dmMessage,
            status: "skipped",
            error: `Límite gratis de respuestas automáticas alcanzado (${dmCheck.used}/${dmCheck.limit} este mes). Activa Pro para quitarlo.`,
          });
          dmAlreadySent = true;
          dmSkipped = true;
        }
      } catch (e) {
        console.warn("[limits] chequeo de DMs mensuales falló — fail-open:", e);
      }
    }
  } catch (e) {
    console.warn("[zernio] dedup/rate check falló (se procede sin control):", e);
  }

  if (followGated) {
    // DM de follow gate: NO entrega el link; botón postback "Ya te sigo" con
    // payload followcheck:<ruleId>:<commentId>. Al tocarlo, llega por webhook.
    const prompt =
      renderUsername(
        matched.followPromptMessage ||
          "Hola {username}! Sígueme y toca el botón para recibir el link 👇",
        commenterName,
      );
    const followBtn = [
      {
        type: "postback",
        title: (matched.followButtonLabel || "Ya te sigo").slice(0, 20),
        payload: `followcheck:${matched.ruleId ?? ""}:${commentId}`,
      },
    ];
    if (dmAlreadySent) {
      dmSkipped = true;
    } else {
      try {
        const res = await fetch(`${base}/v1/inbox/comments/${postId}/${commentId}/private-reply`, {
          method: "POST",
          headers,
          body: JSON.stringify({ accountId, message: prompt, buttons: followBtn }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          // Instagram: "ya se ha enviado una respuesta privada" → el DM ya fue
          // (intento previo). Tratarlo como skipped, no como fallo.
          if (/respuesta privada|private reply|already|invalid for a private reply/i.test(detail)) {
            dmSkipped = true;
            console.warn(`[zernio] follow-gate DM ya enviado antes — se omite (${commentId})`);
          } else {
            dmError = `HTTP ${res.status} ${detail.slice(0, 200)}`;
            console.error(`zernio follow-gate DM falló: ${dmError}`);
          }
        } else {
          dmSent = true;
          console.log(`[zernio] follow-gate DM enviado (link pendiente): ${matched.keywords.join(",")}`);
        }
      } catch (e) {
        dmError = String((e as Error)?.message ?? e);
        console.error("zernio follow-gate DM error:", e);
      }
    }
  } else {
    // DM normal: private-reply al autor del comentario.
    if (dmAlreadySent) {
      dmSkipped = true;
    } else {
      try {
        const res = await fetch(`${base}/v1/inbox/comments/${postId}/${commentId}/private-reply`, {
          method: "POST",
          headers,
          body: JSON.stringify({ accountId, message: dmMessage, buttons: buttons.length ? buttons : undefined }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          // Instagram: "ya se ha enviado una respuesta privada" → el DM ya fue
          // (intento previo del webhook). Tratarlo como skipped.
          if (/respuesta privada|private reply|already|invalid for a private reply/i.test(detail)) {
            dmSkipped = true;
            console.warn(`[zernio] DM ya enviado antes — se omite (${commentId})`);
          } else {
            dmError = `HTTP ${res.status} ${detail.slice(0, 200)}`;
            console.error(`zernio DM falló: ${dmError}`);
          }
        } else {
          dmSent = true;
          console.log(`[zernio] DM enviado por keyword: ${matched.keywords.join(",")}`);
        }
      } catch (e) {
        dmError = String((e as Error)?.message ?? e);
        console.error("zernio DM error:", e);
      }
    }
  }

  // 2) Respuesta pública al comentario (opcional por regla).
  // Si ya se publicó en un intento previo, no se re-publica.
  if (publicReply && !publicAlreadySent) {
    try {
      const res = await fetch(`${base}/v1/inbox/comments/${postId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ accountId, message: publicReply, commentId }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        // "ya respondiste" / "already replied" → la pública ya fue; skipped.
        if (/ya respond|ya.*respuesta|already|duplicate/i.test(detail)) {
          publicSkipped = true;
          console.warn(`[zernio] reply público ya enviado antes — se omite (${commentId})`);
        } else {
          publicError = `HTTP ${res.status} ${detail.slice(0, 200)}`;
          console.error(`zernio reply público falló: ${publicError}`);
        }
      } else {
        publicSent = true;
        console.log(`[zernio] respuesta pública enviada por keyword: ${matched.keywords.join(",")}`);
      }
    } catch (e) {
      publicError = String((e as Error)?.message ?? e);
      console.error("zernio reply público error:", e);
    }
  } else if (publicAlreadySent) {
    publicSkipped = true; // ya publicada en un intento previo
  }

  // Registrar el resultado: dedup + log de automatización (estados honestos).
  try {
    const { Db } = await import("../db/client");
    const { DmLogsRepo } = await import("../db/dmLogs");
    const logs = new DmLogsRepo(new Db(env.DB));
    if (dmSent || publicSent) {
      await logs.recordProcessedComment({
        commentId,
        ruleId: matched.ruleId ?? "",
        status: "sent",
        matchedKeyword: matched.keywords.join(","),
        dmSentAt: dmSent ? Date.now() : undefined,
        publicReplySentAt: publicSent ? Date.now() : undefined,
        error: dmError ?? publicError,
      });
    }
    // Un log por pierna para que el historial no mienta: cada intento de DM y de
    // respuesta pública queda con su propio estado (sent/skipped/failed).
    if (dmSent || dmSkipped || dmError) {
      await logs.log({
        ruleId: matched.ruleId,
        kind: "comment_dm",
        platform: "instagram",
        target: commentId,
        username: commenterName ?? undefined,
        message: dmMessage,
        status: dmSent ? "sent" : dmError ? "failed" : "skipped",
        error: dmError,
      });
    }
    if (publicReply && (publicSent || publicSkipped || publicError)) {
      await logs.log({
        ruleId: matched.ruleId,
        kind: "comment_reply",
        platform: "instagram",
        target: commentId,
        username: commenterName ?? undefined,
        message: publicReply,
        status: publicSent ? "sent" : publicError ? "failed" : "skipped",
        error: publicError,
      });
    }

    // Actualizar el comentario registrado (pestaña Comentarios): qué regla
    // disparó y si el DM / respuesta pública se enviaron.
    try {
      const { CommentsRepo } = await import("../db/comments");
      await new CommentsRepo(new Db(env.DB)).upsert({
        id: commentId,
        ruleId: matched.ruleId,
        dmSent,
        publicReplySent: publicSent,
        publicReplyText: publicReply,
      });
    } catch (e) {
      console.warn("[zernio] no se pudo actualizar el comentario:", e);
    }
  } catch (e) {
    console.warn("[zernio] no se pudo registrar el log:", e);
  }
}

/**
 * Guarda un comentario recibido en la tabla comments (pestaña "Comentarios"
 * del panel, como Zernio). Se llama en cada comment.received, ANTES de la regla.
 */
async function recordZernioComment(body: ZernioWebhookBody, env: Env): Promise<void> {
  const comment = body.comment;
  const account = body.account;
  if (!comment?.id) return;
  try {
    const { Db } = await import("../db/client");
    const { CommentsRepo } = await import("../db/comments");
    const { ContactsRepo } = await import("../db/contacts");
    await new CommentsRepo(new Db(env.DB)).upsert({
      id: comment.id,
      postId: comment.postId ?? undefined,
      platformPostId: comment.platformPostId ?? undefined,
      text: comment.text ?? undefined,
      authorUsername: comment.author?.username,
      authorName: comment.author?.name,
      authorId: comment.author?.id,
      platform: comment.platform ?? account?.platform ?? "instagram",
      accountId: account?.accountId,
    });
    // Registrar el comentarista como contacto (todos los que interactúan).
    if (comment.author?.id) {
      await new ContactsRepo(new Db(env.DB)).touch({
        channel: "zernio",
        channelUserId: `${account?.accountId ?? ""}:${comment.author.id}`,
        displayName: comment.author.name,
        username: comment.author.username,
      });
    }
  } catch (e) {
    console.warn("[zernio] no se pudo guardar el comentario:", e);
  }
}

async function autoDmOnComment(body: ZernioWebhookBody, env: Env): Promise<void> {
  const comment = body.comment;
  const account = body.account;
  if (!comment || !account?.accountId) return;
  const rules = await loadAutoDmRules(env);
  if (rules.length === 0) return;

  const text = comment.text ?? "";
  const matched = rules.find((r) =>
    matchKeywords(text, r.keywords, r.wholeWordMatch !== false).matched,
  );
  if (!matched) return;

  const postId = encodeURIComponent(comment.postId ?? comment.platformPostId ?? "");
  const commentId = comment.id ?? "";
  if (postId && commentId) {
    await sendCommentActions(
      matched,
      account.accountId,
      postId,
      commentId,
      comment.author?.username ?? comment.author?.name,
      comment.author?.id,
      comment.text ?? undefined,
      env,
    );
  }
}

/**
 * Auto-respuesta a DMs (reglas kind=dm_reply del panel): si un DM entrante
 * matchea una keyword, se responde al momento SIN pasar por el agente.
 * Devuelve true si se aplicó una regla (el mensaje NO debe ir a la IA).
 */
async function autoReplyOnDm(body: ZernioWebhookBody, env: Env): Promise<boolean> {
  const m = body.message;
  const conv = body.conversation;
  const account = body.account;
  if (!m || !conv?.id || !account?.accountId) return false;
  const text = (m.text ?? "").trim();
  if (!text) return false;

  const apiKey = (await resolveZernioCredentials(env)).apiKey;
  const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
  if (!apiKey) return false;

  // ── Postback del follow gate (port OpenReply) ────────────────────────────
  // El botón "Ya te sigo" del DM de follow gate trae payload
  // `followcheck:<ruleId>:<commentId>`. Al tocarlo, llega como mensaje
  // entrante: verificamos el follow de nuevo y, si ya sigue, entregamos el
  // link (mensaje real de la regla + botón trackeado).
  const fgMatch = text.match(/^followcheck:([^:]*):(.*)$/);
  if (fgMatch) {
    const ruleId = fgMatch[1];
    try {
      const { Db } = await import("../db/client");
      const { AutoRulesRepo } = await import("../db/autoRules");
      const rule = await new AutoRulesRepo(new Db(env.DB)).get(ruleId);
      if (!rule) return true; // regla borrada → ack

      // Verificar follow actual del que tocó el botón.
      let isFollower = false;
      try {
        const fr = await fetch(
          `${base}/v1/accounts/${encodeURIComponent(account.accountId)}/follow-status/${encodeURIComponent(m.sender?.id ?? "")}`,
          { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(6000) },
        );
        if (fr.ok) {
          const fj = (await fr.json()) as { isFollower?: boolean | null };
          isFollower = fj.isFollower === true;
        }
      } catch (e) {
        console.warn("[zernio] followcheck re-check error:", e);
      }

      if (!isFollower) {
        // Aún no sigue → re-pedir con el mismo botón.
        const prompt = renderUsername(
          rule.followPromptMessage || "Hola {username}! Aún no veo tu follow. Sígueme y toca el botón 👇",
          m.sender?.name ?? m.sender?.username,
        );
        const followBtn = [
          { type: "postback", title: (rule.followButtonLabel || "Ya te sigo").slice(0, 20), payload: `followcheck:${ruleId}:${fgMatch[2]}` },
        ];
        await fetch(`${base}/v1/inbox/conversations/${encodeURIComponent(conv.id)}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: account.accountId, message: prompt, buttons: followBtn }),
        });
        return true;
      }

      // Ya sigue → entregar el link (mensaje real + botón trackeado).
      let buttonUrl = rule.buttonUrl;
      if (buttonUrl && ruleId) {
        try {
          const { TrackedLinksRepo } = await import("../db/trackedLinks");
          const link = await new TrackedLinksRepo(new Db(env.DB)).ensureForRule(ruleId, buttonUrl, rule.buttonLabel);
          const baseUrl = (env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");
          buttonUrl = `${baseUrl}/r/${link.slug}`;
        } catch (e) {
          console.warn("[zernio] followcheck track link error:", e);
        }
      }
      const buttons: { type: string; title: string; url?: string; payload?: string }[] = [];
      if (buttonUrl) {
        buttons.push({ type: "url", title: (rule.buttonLabel || "Abrir").slice(0, 20), url: buttonUrl });
      }
      const dm = renderUsername(rule.message, m.sender?.name ?? m.sender?.username);
      await fetch(`${base}/v1/inbox/conversations/${encodeURIComponent(conv.id)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.accountId, message: dm, buttons: buttons.length ? buttons : undefined }),
      });

      // Registrar la entrega tras el follow gate.
      try {
        const { DmLogsRepo } = await import("../db/dmLogs");
        await new DmLogsRepo(new Db(env.DB)).log({
          ruleId,
          kind: "comment_dm",
          platform: account.platform,
          target: fgMatch[2] || conv.id,
          username: m.sender?.name ?? m.sender?.username,
          message: dm,
          status: "sent",
          error: undefined,
        });
      } catch (e) {
        console.warn("[zernio] followcheck log error:", e);
      }
      return true;
    } catch (e) {
      console.error("[zernio] followcheck handler error:", e);
      return true; // ack para no reintentar
    }
  }

  let rules: AutoDmRule[] = [];
  try {
    const { Db } = await import("../db/client");
    const { AutoRulesRepo } = await import("../db/autoRules");
    const rows = await new AutoRulesRepo(new Db(env.DB)).list({ kind: "dm_reply", onlyActive: true });
    rules = rows.map((r) => ({ ruleId: r.id, keywords: r.keywords, message: r.message, buttonLabel: r.buttonLabel, buttonUrl: r.buttonUrl, wholeWordMatch: r.wholeWordMatch, requireFollow: r.requireFollow, followPromptMessage: r.followPromptMessage, followButtonLabel: r.followButtonLabel }));
  } catch (e) {
    console.warn("[zernio] dm_reply rules lookup failed:", e);
    return false;
  }
  if (rules.length === 0) return false;

  const matched = rules.find((r) => matchKeywords(text, r.keywords, r.wholeWordMatch !== false).matched);
  if (!matched) return false;

  // Trackear el link del botón (misma lógica que en comentarios).
  let buttonUrl = matched.buttonUrl;
  if (buttonUrl && matched.ruleId) {
    try {
      const { Db } = await import("../db/client");
      const { TrackedLinksRepo } = await import("../db/trackedLinks");
      const link = await new TrackedLinksRepo(new Db(env.DB)).ensureForRule(matched.ruleId, buttonUrl, matched.buttonLabel);
      const baseUrl = (env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");
      buttonUrl = `${baseUrl}/r/${link.slug}`;
    } catch (e) {
      console.warn("[zernio] no se pudo trackear el link (DM):", e);
    }
  }

  const buttons: { type: string; title: string; url?: string; payload?: string }[] = [];
  if (buttonUrl) {
    buttons.push({ type: "url", title: matched.buttonLabel?.trim() || "Abrir", url: buttonUrl });
  }
  const dmMessage = renderUsername(matched.message, m.sender?.name ?? m.sender?.username);

  // Rate limit por cuenta antes de enviar (misma lógica que en comentarios).
  try {
    const { Db } = await import("../db/client");
    const { DmLogsRepo } = await import("../db/dmLogs");
    const logs = new DmLogsRepo(new Db(env.DB));
    if (!(await logs.reserveDmSlot(account.accountId))) {
      console.warn(`[zernio] rate limit (dm_reply): cuenta ${account.accountId} agotó su cupo — se salta`);
      await logs.log({
        ruleId: matched.ruleId,
        kind: "dm_reply",
        platform: account.platform,
        target: conv.id,
        username: m.sender?.name ?? m.sender?.username,
        message: dmMessage,
        status: "skipped",
        error: "Rate limit: la cuenta agotó su cupo de esta hora.",
      });
      return true;
    }
  } catch (e) {
    console.warn("[zernio] rate check (dm_reply) falló (se procede sin control):", e);
  }

  let ok = false;
  let err: string | undefined;
  try {
    const res = await fetch(`${base}/v1/inbox/conversations/${encodeURIComponent(conv.id)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.accountId, message: dmMessage, buttons: buttons.length ? buttons : undefined }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      err = `HTTP ${res.status} ${detail.slice(0, 200)}`;
      console.error(`zernio dm_reply falló: ${err}`);
    } else {
      ok = true;
      console.log(`[zernio] dm_reply enviado por keyword: ${matched.keywords.join(",")}`);
    }
  } catch (e) {
    err = String((e as Error)?.message ?? e);
    console.error("zernio dm_reply error:", e);
  }

  // Registrar el intento en el historial del panel.
  try {
    const { Db } = await import("../db/client");
    const { DmLogsRepo } = await import("../db/dmLogs");
    await new DmLogsRepo(new Db(env.DB)).log({
      ruleId: matched.ruleId,
      kind: "dm_reply",
      platform: account.platform,
      target: conv.id,
      username: m.sender?.name ?? m.sender?.username,
      message: dmMessage,
      status: ok ? "sent" : "failed",
      error: err,
    });
  } catch (e) {
    console.warn("[zernio] no se pudo registrar dm_reply log:", e);
  }

  return ok;
}

// ─── Parseo de eventos ───────────────────────────────────────────────────────
// Devuelve 0..N mensajes entrantes para el agente. Los comentarios no entran
// al agente: disparan el auto-DM (si aplica) y se descartan.
export async function parseZernioEvents(body: unknown, env: Env): Promise<IncomingMessage[]> {
  const b = (body ?? {}) as ZernioWebhookBody;
  const event = b.event ?? "";

  if (event === "message.received") {
    const m = b.message;
    const conv = b.conversation;
    const account = b.account;
    if (!m || m.direction !== "incoming") return [];
    const convId = conv?.id;
    const accountId = account?.accountId;
    if (!convId || !accountId) return [];

    // Flujo automático de DM (reglas dm_reply del panel): si una keyword
    // matchea, respondemos ya y el mensaje NO entra al agente.
    if (await autoReplyOnDm(b, env)) {
      console.log("[zernio] dm_reply automático aplicado — no entra al agente");
      return [];
    }

    const { audio, image } = firstUrl(m);
    const name = conv?.participantName || m.sender?.name || m.sender?.username;

    // channelUserId lleva accountId + conversationId (sendReply los necesita).
    console.log("[zernio] msg in:", JSON.stringify({ platform: account.platform, hasText: !!m.text, img: !!image, aud: !!audio }));
    return [
      {
        channel: "zernio" as ChannelId,
        channelUserId: `${accountId}:${convId}`,
        displayName: name,
        text: m.text ?? undefined,
        audioUrl: audio,
        imageUrl: image,
        isOwnerMessage: false,
        receivedAt: Date.now(),
        rawPayload: b,
      },
    ];
  }

  if (event === "comment.received") {
    await recordZernioComment(b, env);
    await autoDmOnComment(b, env);
    return [];
  }

  // reaction.received y otros eventos de ciclo de vida: ack sin procesar.
  return [];
}

// ─── Adapter ─────────────────────────────────────────────────────────────────
export const zernioAdapter: ChannelAdapter = {
  // Existe por la interfaz; el webhook /webhooks/zernio usa parseZernioEvents
  // directamente (firma + varios eventos + side effects).
  async parseIncoming(request: Request, env: Env): Promise<IncomingMessage> {
    const body = (await request.json()) as unknown;
    const [first] = await parseZernioEvents(body, env);
    if (!first) throw new Error("zernio webhook sin mensaje procesable");
    return first;
  },

  async sendReply(reply: OutgoingReply, env: Env): Promise<void> {
    const { apiKey } = await resolveZernioCredentials(env);
    if (!apiKey) throw new Error("ZERNIO_API_KEY not set");
    const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
    // channelUserId = "<accountId>:<conversationId>"
    const sep = reply.channelUserId.indexOf(":");
    if (sep <= 0) throw new Error("zernio: channelUserId sin accountId");
    const accountId = reply.channelUserId.slice(0, sep);
    const conversationId = reply.channelUserId.slice(sep + 1);

    for (let i = 0; i < reply.chunks.length; i++) {
      const delay = i === 0 ? 0 : reply.interChunkDelayMs ?? 1000;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const isLast = i === reply.chunks.length - 1;
      const buttons =
        isLast && reply.buttons && reply.buttons.length > 0
          ? reply.buttons.map((b) => ({
              type: b.url ? "url" : "postback",
              title: b.text.slice(0, 20),
              ...(b.url ? { url: b.url } : {}),
              ...(b.callback ? { payload: b.callback } : {}),
            }))
          : undefined;
      // Multimedia: imagen/audio como attachment del primer chunk (Zernio lo soporta).
      const attachments =
        i === 0
          ? [
              ...(reply.imageUrl ? [{ type: "image", url: reply.imageUrl }] : []),
              ...(reply.audioUrl ? [{ type: "audio", url: reply.audioUrl }] : []),
            ]
          : undefined;
      const res = await fetch(`${base}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId,
          message: reply.chunks[i],
          ...(buttons && buttons.length ? { buttons } : {}),
          ...(attachments && attachments.length ? { attachments } : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`zernio send falló: ${res.status} ${detail.slice(0, 200)}`);
      }
    }
  },
};
