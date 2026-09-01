/**
 * Admin dashboard routes (Hono sub-app mounted at `/admin`).
 *
 * Auth is HTTP Basic Auth (owner override of the original magic-link plan):
 * every route is guarded by `adminAuth(env)`, which prompts the browser's
 * native Basic Auth dialog. Username is always "admin", password lives in the
 * `DASHBOARD_PASSWORD` secret. There are NO /login or /logout routes — Basic
 * Auth does not need them.
 *
 * Because the Basic Auth middleware needs the per-request `Env` (to read
 * `DASHBOARD_PASSWORD` from the binding), it is applied inside a wildcard
 * middleware that has access to `c.env` rather than at module-init time.
 */
import { parsePeerBots } from "./projects";
import { Hono } from "hono";
import { generateText } from "ai";
import { createModel } from "../llm/provider";
import { loadLlmOverrides } from "../settings-loader";
import type { Env } from "../env";
import { adminAuth } from "./auth";
import { layout, renderUpgrade } from "./views/layout";
import { isProUnlocked } from "../config";
import { renderOverview } from "./views/overview";
import { renderStats } from "./views/stats";
import { renderCosts } from "./views/costs";
import {
  renderInbox,
  renderInboxList,
  renderThreadLive,
  renderSuggestionBox,
} from "./views/conversations";
import { pickAdapter } from "../replies/sender";
import { channelLabel } from "../channels/labels";
import type { ChannelId } from "../channels/shared";
import { renderInsights } from "./views/insights";
import { analyzeConversations } from "../insights/analyzer";
import { renderAgentePage, renderAgenteCanvas, renderNodeModal, toggleTool, toastOob } from "./views/agente";
import { renderKbList, renderKbEditor } from "./views/kb";
import { KbDocsRepo, indexDoc, removeDocVectors, reindexAll, MAX_DOC_CHARS } from "../kb/docs";
import { renderMejoras } from "./views/mejoras";
import { runFlywheel, getLessons, saveLessons } from "../flywheel/detect";
import { applySuggestion, dismissSuggestion } from "../flywheel/apply";
import { renderLeads, exportLeadsCsv } from "./views/leads";
import { renderTickets } from "./views/tickets";
import { renderConfig } from "./views/config";
import { renderExtras } from "./views/extras";
import { renderAutomatizaciones } from "./views/automatizaciones";
import { renderComentarios } from "./views/comentarios";
import { renderContactos } from "./views/contactos";
import { renderLicencia } from "./views/licencia";
import { AutoRulesRepo, type AutoRuleKind } from "../db/autoRules";

/** Parsea el form de una automatización (crear o editar) a un objeto de regla. */
function parseRuleForm(form: FormData) {
  const kind = String(form.get("kind") ?? "comment_dm") as AutoRuleKind;
  const platform = String(form.get("platform") ?? "all").trim() || "all";
  const keywords = String(form.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const message = String(form.get("message") ?? "").trim();
  const buttonLabel = String(form.get("button_label") ?? "").trim() || undefined;
  const buttonUrl = String(form.get("button_url") ?? "").trim() || undefined;
  const replyToComment = String(form.get("reply_to_comment") ?? "").trim() || undefined;
  const aiReplyPrompt = String(form.get("ai_reply_prompt") ?? "").trim() || undefined;
  const wholeWordMatch = String(form.get("whole_word_match") ?? "") !== "0";
  const requireFollow = String(form.get("require_follow") ?? "") === "1";
  const followPromptMessage = String(form.get("follow_prompt_message") ?? "").trim() || undefined;
  const followButtonLabel = String(form.get("follow_button_label") ?? "").trim() || undefined;
  return { kind, platform, keywords, message, buttonLabel, buttonUrl, replyToComment, aiReplyPrompt, wholeWordMatch, requireFollow, followPromptMessage, followButtonLabel };
}
import { renderConexiones } from "./views/conexiones";
import { resolveZernioCredentials } from "../channels/zernioCredentials";
import { renderCampanas } from "./views/campanas";
import { sendCampaign, createHandoffTemplate, contentApprovalStatus } from "../campaigns";
import { Db } from "../db/client";
import { LeadsRepo, type Lead } from "../db/leads";
import { TicketsRepo } from "../db/tickets";
import { ConversationsRepo } from "../db/conversations";
import { MessagesRepo } from "../db/messages";
import { SettingsRepo, SETTING_KEYS, type SettingKey } from "../db/settings";
import { CONTROLS, levelToValue } from "./control-levels";
import { systemPromptFromEnv } from "../system-prompt";
import { renderBusinessContext } from "../businessContext";

export const adminApp = new Hono<{ Bindings: Env }>();

// Guard every admin route with Basic Auth. The middleware factory needs the
// request-scoped Env to read DASHBOARD_PASSWORD, so build it per request here.
// DASHBOARD_PUBLIC="1" (wrangler.toml de esta instancia) apaga el guard —
// el panel es público a propósito (decisión de diseño de la instancia).
// Para volver a protegerlo: quitar esa var y redeploy.
adminApp.use("*", (c, next) => {
  if (c.env.DASHBOARD_PUBLIC === "1") return next();
  return adminAuth(c.env)(c, next);
});

// Gate de tier: el panel free ve el nav Pro bloqueado; si aun así navega a una
// ruta Pro (URL directa, bookmark, click al item bloqueado), servimos la página
// de upgrade en vez de la vista real. Los datos Pro nunca se exponen en free.
const PRO_GATE: Array<[string, string]> = [
  ["/admin/insights", "Insights"],
  ["/admin/stats", "Estadísticas"],
  ["/admin/costs", "Costos"],
  ["/admin/mejoras", "Mejoras"],
  ["/admin/campanas", "Campañas"],
];
adminApp.use("*", async (c, next) => {
  if (await isProUnlocked(c.env)) return next();
  const path = c.req.path;
  const hit = PRO_GATE.find(([pre]) => path === pre || path.startsWith(pre + "/"));
  if (hit) return c.html(await renderUpgrade(c.env, hit[1]));
  return next();
});

// Página de upgrade (item bloqueado del nav apunta aquí).
adminApp.get("/upgrade", async (c) => c.html(await renderUpgrade(c.env)));

// Root → default tab.
adminApp.get("/", (c) => c.redirect("/admin/overview"));

// Cerrar sesión (Basic Auth): al recibir 401 + WWW-Authenticate, el navegador
// limpia las credenciales guardadas de este realm y pedirá login en la próxima
// visita. Es el equivalente a "logout" para autenticación básica.
adminApp.get("/logout", (c) =>
  new Response("Sesión cerrada. Vuelve a entrar cuando quieras (usuario admin).", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Kooni", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  }),
);

// Selector de proyectos (header): instancia actual + hermanas de PEER_BOTS.
adminApp.get("/projects", (c) =>
  c.json({ current: c.env.BOT_NAME ?? "Mi bot", peers: parsePeerBots(c.env) }),
);

// --- Read-only tabs ---------------------------------------------------------

adminApp.get("/overview", async (c) => c.html(await renderOverview(c.env)));

adminApp.get("/stats", async (c) => c.html(await renderStats(c.env)));

adminApp.get("/costs", async (c) => c.html(await renderCosts(c.env, c.req.query("saved") === "1")));

// Monthly AI budget (Costos tab). Empty value clears the cap.
adminApp.post("/costs/budget", async (c) => {
  const form = await c.req.formData();
  const raw = String(form.get("monthly_budget") ?? "").trim();
  const n = Number.parseFloat(raw);
  const value = raw !== "" && Number.isFinite(n) && n > 0 ? String(n) : "";
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.monthlyBudget, value);
  return c.redirect("/admin/costs?saved=1");
});

// --- Conocimiento (KB editable, F4) -------------------------------------------

adminApp.get("/kb", async (c) =>
  c.html(
    await renderKbList(c.env, {
      saved: c.req.query("saved") === "1",
      deleted: c.req.query("deleted") === "1",
      reindexed: c.req.query("reindexed") ?? undefined,
    }),
  ),
);

adminApp.get("/kb/new", async (c) => c.html(await renderKbEditor(null, c.env)));

adminApp.get("/kb/:id/edit", async (c) => {
  const doc = await new KbDocsRepo(new Db(c.env.DB)).getById(c.req.param("id"));
  if (!doc) return c.redirect("/admin/kb");
  return c.html(await renderKbEditor(doc, c.env));
});

// Save = persist in D1 + index into Vectorize immediately (stale vectors for
// the doc are blanket-deleted first), so searchKb uses it on the next message.
adminApp.post("/kb/save", async (c) => {
  const form = await c.req.formData();
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const content = String(form.get("content") ?? "").trim().slice(0, MAX_DOC_CHARS);
  if (!title || !content) return c.redirect("/admin/kb");

  const id = String(form.get("id") ?? "").trim() || crypto.randomUUID();
  const repo = new KbDocsRepo(new Db(c.env.DB));
  await repo.upsert({ id, title, content });
  const doc = (await repo.getById(id))!;
  await indexDoc(c.env, doc);
  return c.redirect("/admin/kb?saved=1");
});

adminApp.post("/kb/:id/delete", async (c) => {
  const id = c.req.param("id");
  await new KbDocsRepo(new Db(c.env.DB)).delete(id);
  await removeDocVectors(c.env, id);
  return c.redirect("/admin/kb?deleted=1");
});

// Global reindex: repo fixtures + every dashboard doc.
adminApp.post("/kb/reindex", async (c) => {
  const r = await reindexAll(c.env);
  return c.redirect(`/admin/kb?reindexed=${r.indexed}`);
});

// --- Handoff: plantilla HSM del aviso al dueño ---------------------------------

// Setup one-shot: crea la plantilla en la Content API de Twilio, la somete a
// aprobación de WhatsApp (UTILITY) y guarda el ContentSid en settings —
// notifyOwner la usa como fallback del secret, sin pasos manuales.
adminApp.post("/handoff/template/setup", async (c) => {
  const r = await createHandoffTemplate(c.env);
  if ("error" in r) return c.json(r, 502);
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.twilioHandoffContentSid, r.sid);
  return c.json(r);
});

// Estado de aprobación de la plantilla del handoff (approved | pending | …).
adminApp.get("/handoff/template/status", async (c) => {
  const sid =
    c.env.TWILIO_HANDOFF_CONTENT_SID ||
    (await new SettingsRepo(new Db(c.env.DB)).get(SETTING_KEYS.twilioHandoffContentSid));
  if (!sid) return c.json({ error: "sin plantilla — corre el setup primero" }, 404);
  const r = await contentApprovalStatus(c.env, sid);
  return c.json({ sid, ...r });
});

// --- Mejoras (flywheel, F5) ----------------------------------------------------

adminApp.get("/mejoras", async (c) =>
  c.html(
    await renderMejoras(c.env, {
      found: c.req.query("found") ?? undefined,
      applied: c.req.query("applied") === "1",
      dismissed: c.req.query("dismissed") === "1",
    }),
  ),
);

// Run the detectors on demand (they also run nightly from scheduled()).
adminApp.post("/mejoras/run", async (c) => {
  const r = await runFlywheel(c.env);
  return c.redirect(`/admin/mejoras?found=${r.created}`);
});

adminApp.post("/mejoras/:id/apply", async (c) => {
  const ok = await applySuggestion(c.env, c.req.param("id"));
  return c.redirect(ok ? "/admin/mejoras?applied=1" : "/admin/mejoras");
});

adminApp.post("/mejoras/:id/dismiss", async (c) => {
  const ok = await dismissSuggestion(c.env, c.req.param("id"));
  return c.redirect(ok ? "/admin/mejoras?dismissed=1" : "/admin/mejoras");
});

// Autonomía del flywheel: manual (default) o copiloto (auto-aplica lo seguro
// en el cron nocturno — KB sin huecos y lecciones; lo delicado sigue en cola).
adminApp.post("/mejoras/autonomy", async (c) => {
  const form = await c.req.formData();
  const level = String(form.get("level") ?? "manual") === "copilot" ? "copilot" : "manual";
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.autonomyLevel, level);
  return c.redirect("/admin/mejoras");
});

// Remove one lesson from the prompt (the ✕ next to each active lesson).
adminApp.post("/mejoras/lessons/remove", async (c) => {
  const form = await c.req.formData();
  const lesson = String(form.get("lesson") ?? "");
  const lessons = (await getLessons(c.env)).filter((l) => l !== lesson);
  await saveLessons(c.env, lessons);
  return c.redirect("/admin/mejoras");
});

// Inbox (F1): two-pane view. ?c=<id> selects the thread; ?f/?q filter the list.
adminApp.get("/conversations", async (c) =>
  c.html(
    await renderInbox(c.env, {
      search: c.req.query("q"),
      filter: c.req.query("f"),
      selectedId: c.req.query("c"),
    }),
  ),
);

// HTMX fragments (polled): left list every 10s, thread every 5s. Registered
// before /conversations/:id so the static segments win the match.
adminApp.get("/conversations/list-fragment", async (c) =>
  c.html(
    await renderInboxList(c.env, {
      search: c.req.query("q"),
      filter: c.req.query("f"),
      selectedId: c.req.query("c"),
    }),
  ),
);

adminApp.get("/conversations/thread/:id", async (c) =>
  c.html(await renderThreadLive(c.env, c.req.param("id"))),
);

// Old detail URLs (linked from Insights, notifications, etc.) → inbox selection.
adminApp.get("/conversations/:id", (c) =>
  c.redirect(`/admin/conversations?c=${encodeURIComponent(c.req.param("id"))}`),
);

// Insights tab. Visiting it opportunistically grades a few pending
// conversations in the background (waitUntil) so the tab catches up on its own
// even without pressing "Analizar ahora". TODO: move the main run to
// scheduled() in index.ts once the channels/meta work in flight there lands.
adminApp.get("/insights", async (c) => {
  try {
    c.executionCtx.waitUntil(
      analyzeConversations(c.env, { limit: 3 }).catch((e) =>
        console.error("[insights] background analysis failed:", e),
      ),
    );
  } catch {
    // no executionCtx (tests) — render without background catch-up
  }
  return c.html(await renderInsights(c.env, c.req.query("analyzed") ?? undefined));
});

// "Analizar ahora": grade up to 10 pending conversations inline, then redirect
// back with the count for the confirmation banner.
adminApp.post("/insights/analyze", async (c) => {
  const result = await analyzeConversations(c.env, { limit: 10 });
  return c.redirect(`/admin/insights?analyzed=${result.analyzed}`);
});

// "Mi Agente": n8n-style canvas of how the bot works. The canvas fragment is
// polled by HTMX every 15s (live activity pulse); node panels load on click.
adminApp.get("/agente", async (c) => c.html(await renderAgentePage(c.env)));

adminApp.get("/agente/canvas", async (c) => c.html(await renderAgenteCanvas(c.env)));

adminApp.get("/agente/node/:id", async (c) =>
  c.html(await renderNodeModal(c.env, c.req.param("id"))),
);

// Save a node's config from its modal. Writes the relevant settings (with
// clamps), re-renders the modal with a saved banner + toast, and fires the
// `canvas-refresh` event so the diagram updates immediately.
adminApp.post("/agente/node/:id/save", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const num = (key: string): number | null => {
    const raw = form.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  if (id === "buffer") {
    const s = num("buffer_seconds");
    if (s !== null) await repo.set(SETTING_KEYS.bufferSeconds, String(Math.round(clamp(s, 1, 60))));
  } else if (id === "reply") {
    const chunks = num("max_chunks");
    if (chunks !== null) await repo.set(SETTING_KEYS.maxChunks, String(Math.round(clamp(chunks, 1, 5))));
    const delayS = num("inter_chunk_delay_s");
    if (delayS !== null)
      await repo.set(SETTING_KEYS.interChunkDelayMs, String(Math.round(clamp(delayS, 0, 5) * 1000)));
  } else if (id === "model") {
    const m = String(form.get("model_override") ?? "");
    if (m === "auto" || m === "haiku" || m === "sonnet") await repo.set(SETTING_KEYS.modelOverride, m);
    const t = num("temperature");
    if (t !== null) await repo.set(SETTING_KEYS.temperature, String(clamp(t, 0, 1)));
  } else if (id === "brain") {
    // Three sub-actions share the brain modal: reset-to-auto, pause toggle,
    // and saving the manual prompt. Checked in that priority order.
    if (String(form.get("action") ?? "") === "reset") {
      await repo.set(SETTING_KEYS.systemPromptOverride, "");
    } else if (form.get("bot_paused") !== null) {
      await repo.set(SETTING_KEYS.botPaused, String(form.get("bot_paused")) === "1" ? "1" : "0");
    } else if (form.get("channel_pause") !== null) {
      // Pausa por canal: form manda "channel_pause=<canal>" + "channel_paused=1|0".
      // Mantiene la lista JSON de canales pausados (paused_channels).
      const channel = String(form.get("channel_pause")).trim();
      const pause = String(form.get("channel_paused")) === "1";
      if (channel) {
        let list: string[] = [];
        try {
          const raw = await repo.get(SETTING_KEYS.pausedChannels);
          if (raw) list = JSON.parse(raw);
        } catch {
          list = [];
        }
        if (!Array.isArray(list)) list = [];
        list = pause
          ? [...new Set([...list, channel])]
          : list.filter((c) => c !== channel);
        await repo.set(SETTING_KEYS.pausedChannels, JSON.stringify(list));
      }
    } else if (form.get("custom_instructions") !== null) {
      // El campo ADITIVO: se suma al prompt generado sin congelarlo. Guardar
      // vacío = quitar las instrucciones (por eso no se filtra el "").
      await repo.set(SETTING_KEYS.customInstructions, String(form.get("custom_instructions")).trim());
    } else if (form.get("system_prompt_override") !== null) {
      await repo.set(SETTING_KEYS.systemPromptOverride, String(form.get("system_prompt_override")).trim());
    }
  } else {
    return c.text("Nodo desconocido", 404);
  }

  c.header("HX-Trigger", "canvas-refresh");
  return c.html((await renderNodeModal(c.env, id, true)) + toastOob("✓ Guardado"));
});

// Toggle a tool on/off (settings.disabled_tools). Returns the refreshed modal;
// the canvas badge updates via the canvas-refresh event.
adminApp.post("/agente/tools/:name/toggle", async (c) => {
  const name = c.req.param("name");
  const ok = await toggleTool(c.env, name);
  if (!ok) return c.text("Tool no encontrada", 404);
  c.header("HX-Trigger", "canvas-refresh");
  return c.html((await renderNodeModal(c.env, `tool:${name}`, true)) + toastOob("✓ Guardado"));
});

adminApp.get("/leads", async (c) => c.html(await renderLeads(c.env)));

adminApp.get("/tickets", async (c) => c.html(await renderTickets(c.env)));

// Conexiones: mapa de canales con estado verde/gris (paso 4 del onboarding).
// Lee los canales pausados de settings y las cuentas conectadas de Zernio.
adminApp.get("/conexiones", async (c) => {
  let pausedChannels: string[] = [];
  try {
    const { Db } = await import("../db/client");
    const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
    const raw = await new SettingsRepo(new Db(c.env.DB)).get(SETTING_KEYS.pausedChannels);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) pausedChannels = parsed.map((x) => String(x)).filter(Boolean);
    }
  } catch {
    // sin settings: sin canales pausados
  }
  const { listZernioAccounts } = await import("../channels/zernioAccounts");
  const { resolveTelegramToken, resolveOwnerTelegramChatId } = await import("../channels/telegramCredentials");
  const zernioAccounts = await listZernioAccounts(c.env);
  const zernioCreds = await resolveZernioCredentials(c.env);
  const telegramToken = await resolveTelegramToken(c.env);
  const ownerChatId = await resolveOwnerTelegramChatId(c.env);

  // Uso de rate limit por cuenta (DM/hora) para mostrar en la card Zernio.
  const rateUsage: Record<string, { used: number; windowStart: number }> = {};
  try {
    const { Db } = await import("../db/client");
    const { DmLogsRepo } = await import("../db/dmLogs");
    const logs = new DmLogsRepo(new Db(c.env.DB));
    for (const acc of zernioAccounts) {
      rateUsage[acc.id] = await logs.currentHourUsage(acc.id);
    }
  } catch {
    // sin rate usage
  }
  // Fallback de origin para la webhook URL: si DASHBOARD_BASE_URL está vacío,
  // usamos la URL real del request para que las cards SIEMPRE muestren su webhook.
  const baseUrl = c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin;
  return c.html(await renderConexiones(c.env, pausedChannels, zernioAccounts, rateUsage, {
    zernioCreds,
    telegramToken,
    ownerChatId,
    baseUrl,
    savedKind: c.req.query("telegram") === "saved" ? "telegram" : c.req.query("zernio") === "saved" ? "zernio" : undefined,
    error:
      c.req.query("zernio") === "error"
        ? (c.req.query("msg") ?? "No se pudo validar la API key.")
        : c.req.query("telegram") === "error"
          ? (c.req.query("msg") ?? "No se pudo validar el token de Telegram.")
          : undefined,
  }));
});

// Conectar Zernio desde el panel: guarda API key + webhook secret en D1 (settings)
// para que el canal quede activo sin `wrangler secret put` ni redeploy. Si viene
// una key nueva, se valida con GET /v1/accounts antes de guardarla.
adminApp.post("/conexiones/zernio", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  const zBase = c.env.ZERNIO_API_BASE_URL ?? "https://zernio.com/api";
  const baseUrl = (c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin).replace(/\/$/, "");
  const whUrl = `${baseUrl}/webhooks/zernio`;
  const EVENTS = ["message.received", "comment.received", "reaction.received"];

  if (String(form.get("clear") ?? "") === "1") {
    // Desregistrar el webhook de Zernio (best-effort) antes de borrar las creds.
    const oldKey = await repo.get(SETTING_KEYS.zernioApiKey);
    if (oldKey) {
      try {
        const listRes = await fetch(`${zBase}/v1/webhooks/settings`, {
          headers: { Authorization: `Bearer ${oldKey}` },
          signal: AbortSignal.timeout(8000),
        });
        const listJson = (await listRes.json().catch(() => ({}))) as { webhooks?: Array<{ _id: string; url?: string }> };
        for (const w of (listJson.webhooks ?? []).filter((w) => w.url === whUrl)) {
          await fetch(`${zBase}/v1/webhooks/settings?id=${encodeURIComponent(w._id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${oldKey}` },
            signal: AbortSignal.timeout(8000),
          });
        }
      } catch { /* best-effort */ }
    }
    await repo.set(SETTING_KEYS.zernioApiKey, "");
    await repo.set(SETTING_KEYS.zernioWebhookSecret, "");
    return c.redirect("/admin/conexiones?zernio=saved");
  }

  const apiKey = String(form.get("zernio_api_key") ?? "").trim();
  const webhookSecret = String(form.get("zernio_webhook_secret") ?? "").trim();

  // Si NO escribieron una key nueva (campo vacío), se conserva la que ya existe.
  const existing = await repo.get(SETTING_KEYS.zernioApiKey);
  const keyToSave = apiKey || existing || "";

  if (keyToSave) {
    // Validación directa contra la API de Zernio (GET /v1/accounts). Una key
    // inválida devuelve 4xx/5xx; una válida devuelve 2xx (aunque no haya cuentas).
    const base = c.env.ZERNIO_API_BASE_URL ?? "https://zernio.com/api";
    let valid = false;
    let status = 0;
    try {
      const res = await fetch(`${base}/v1/accounts`, {
        headers: { Authorization: `Bearer ${keyToSave}` },
        signal: AbortSignal.timeout(8000),
      });
      status = res.status;
      valid = res.ok;
    } catch {
      return c.redirect(`/admin/conexiones?zernio=error&msg=${encodeURIComponent("No se pudo contactar Zernio para validar la API key.")}`);
    }
    if (!valid) {
      return c.redirect(`/admin/conexiones?zernio=error&msg=${encodeURIComponent(`La API key no es válida (HTTP ${status}).`)}`);
    }
  }

  await repo.set(SETTING_KEYS.zernioApiKey, keyToSave);
  // El webhook secret solo se sobreescribe si escribieron algo.
  if (webhookSecret) {
    await repo.set(SETTING_KEYS.zernioWebhookSecret, webhookSecret);
  }

  // Registrar el webhook automáticamente (como Telegram): sin esto Zernio no
  // entrega message.received/comment.received y las automatizaciones no corren.
  if (keyToSave) {
    const effSecret = webhookSecret || (await repo.get(SETTING_KEYS.zernioWebhookSecret)) || "";
    const headers = { Authorization: `Bearer ${keyToSave}`, "Content-Type": "application/json" };
    try {
      const listRes = await fetch(`${zBase}/v1/webhooks/settings`, { headers, signal: AbortSignal.timeout(8000) });
      const listJson = (await listRes.json().catch(() => ({}))) as { webhooks?: Array<{ _id: string; url?: string }> };
      const mine = (listJson.webhooks ?? []).filter((w) => w.url === whUrl);
      const body: Record<string, unknown> = { url: whUrl, events: EVENTS, isActive: true };
      if (effSecret) body.secret = effSecret;
      let regRes: Response;
      if (mine.length > 0) {
        body._id = mine[0]._id;
        regRes = await fetch(`${zBase}/v1/webhooks/settings`, { method: "PUT", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      } else {
        body.name = "Kooni";
        regRes = await fetch(`${zBase}/v1/webhooks/settings`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      }
      if (!regRes.ok) {
        return c.redirect(`/admin/conexiones?zernio=error&msg=${encodeURIComponent("API key guardada, pero no pude registrar el webhook en Zernio (HTTP " + regRes.status + ").")}`);
      }
    } catch {
      return c.redirect(`/admin/conexiones?zernio=error&msg=${encodeURIComponent("API key guardada, pero no pude contactar Zernio para registrar el webhook.")}`);
    }
  }

  return c.redirect("/admin/conexiones?zernio=saved");
});

// Conectar Telegram desde el panel: guarda el token del bot en D1 (settings),
// validándolo con getMe antes de persistirlo, y REGISTRA el webhook del worker
// automáticamente (setWebhook). Sin `wrangler secret put` ni redeploy.
adminApp.post("/conexiones/telegram", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  const existing = await repo.get(SETTING_KEYS.telegramBotToken);

  // "Quitar conexión": borra el token y el aviso al dueño (y desregistra el webhook).
  if (String(form.get("clear") ?? "") === "1") {
    if (existing) {
      try {
        await fetch(`https://api.telegram.org/bot${existing}/deleteWebhook`, {
          method: "POST",
          signal: AbortSignal.timeout(6000),
        });
      } catch { /* best-effort */ }
    }
    await repo.set(SETTING_KEYS.telegramBotToken, "");
    await repo.set(SETTING_KEYS.ownerTelegramChatId, "");
    return c.redirect("/admin/conexiones?telegram=saved");
  }

  const token = String(form.get("telegram_bot_token") ?? "").trim();
  // Campo vacío: conserva el token existente.
  const tokenToSave = token || existing || "";

  // Chat id del dueño (avisos de handoff por DM): si viene el campo, se guarda;
  // si viene clear_owner=1, se borra. Campo vacío + sin clear = se conserva.
  const ownerInput = String(form.get("owner_telegram_chat_id") ?? "").trim();
  if (ownerInput) {
    await repo.set(SETTING_KEYS.ownerTelegramChatId, ownerInput);
  } else if (String(form.get("clear_owner") ?? "") === "1") {
    await repo.set(SETTING_KEYS.ownerTelegramChatId, "");
  }

  if (tokenToSave) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tokenToSave}/getMe`, {
        signal: AbortSignal.timeout(8000),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || j.ok !== true) {
        return c.redirect(`/admin/conexiones?telegram=error&msg=${encodeURIComponent("El token de Telegram no es válido.")}`);
      }
    } catch {
      return c.redirect(`/admin/conexiones?telegram=error&msg=${encodeURIComponent("No se pudo contactar Telegram para validar el token.")}`);
    }

    await repo.set(SETTING_KEYS.telegramBotToken, tokenToSave);

    // Registrar el webhook del worker: sin esto Telegram NO entrega ningún
    // mensaje (el síntoma es "el token sale conectado pero el bot no responde").
    // Se reintenta un par de veces: un workers.dev recién desplegado a veces da
    // "Temporary failure in name resolution" en el resolver de Telegram.
    const baseUrl = (c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin).replace(/\/$/, "");
    let whError = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const whRes = await fetch(`https://api.telegram.org/bot${tokenToSave}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: `${baseUrl}/webhooks/telegram`, allowed_updates: ["message"] }),
          signal: AbortSignal.timeout(8000),
        });
        const wh = (await whRes.json().catch(() => ({}))) as { ok?: boolean; description?: string };
        if (whRes.ok && wh.ok === true) { whError = ""; break; }
        whError = wh.description ?? "error de Telegram";
      } catch {
        whError = "no se pudo contactar Telegram";
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
    }
    if (whError) {
      return c.redirect(`/admin/conexiones?telegram=error&msg=${encodeURIComponent("Token guardado, pero no pude registrar el webhook: " + whError)}`);
    }
  }

  return c.redirect("/admin/conexiones?telegram=saved");
});

// Licencia: activa Pro pegando un código KOONI-PRO-... (validación local HMAC).
adminApp.get("/licencia", async (c) => c.html(await renderLicencia(c.env)));

// Menú Extras (Forja+): cuadrícula de funciones de pago con toggles on/off.
adminApp.get("/extras", async (c) => {
  const saved = c.req.query("saved") === "1";
  return c.html(await renderExtras(c.env, saved, c.req.query("report")));
});

adminApp.post("/extras", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  const { EXTRA_FEATURES } = await import("../features");
  // Toggles de todas las funciones del catálogo (reporte incluido).
  for (const f of EXTRA_FEATURES) {
    await repo.set(f.toggleKey, form.get(f.toggleKey) === "1" ? "1" : "0");
    // Campos de config de la función (links de reseñas / pago, etc.).
    for (const c of f.config ?? []) {
      await repo.set(c.key, String(form.get(c.key) ?? "").trim());
    }
  }
  // Canal del reporte nocturno (allow-list).
  const channel = String(form.get(SETTING_KEYS.nightlyReportChannel) ?? "telegram").trim().toLowerCase();
  await repo.set(SETTING_KEYS.nightlyReportChannel, ["telegram", "email", "both"].includes(channel) ? channel : "telegram");
  return c.redirect("/admin/extras?saved=1");
});

adminApp.post("/licencia", async (c) => {
  const { Db } = await import("../db/client");
  const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
  const { verifyLicense, verifyLicenseFor } = await import("../license");
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));

  if (form.get("clear")) {
    await repo.set(SETTING_KEYS.proLicense, "");
    return c.html(await renderLicencia(c.env, "Licencia quitada. El bot vuelve al plan gratis.", false));
  }

  const code = String(form.get("code") ?? "").trim();
  if (!code) return c.html(await renderLicencia(c.env, "Pega un código de licencia.", true));
  const payload = verifyLicense(code, c.env);
  if (!payload) {
    return c.html(await renderLicencia(c.env, "Código inválido o vencido. Verifícalo con quien te lo vendió.", true));
  }
  if (!verifyLicenseFor(c.env, code, { instanceUid: c.env.BOT_INSTANCE_ID })) {
    return c.html(await renderLicencia(c.env, "Este código es de OTRA instalación. Pide una licencia para este bot específico.", true));
  }
  await repo.set(SETTING_KEYS.proLicense, code);
  const detail = payload.kind === "monthly" && payload.expiry
    ? `válido hasta ${new Date(payload.expiry).toLocaleDateString("es")}`
    : "para siempre";
  return c.html(await renderLicencia(c.env, `✓ Pro activado (${payload.kind}, ${detail}). Límites quitados.`, false));
});

// Automatizaciones: flujos keyword → respuesta (comentarios y DMs) desde el panel.
adminApp.get("/automatizaciones", async (c) =>
  c.html(
    await renderAutomatizaciones(c.env, c.req.query("saved") === "1", c.req.query("error")),
  ),
);

// Comentarios: bandeja de comentarios recibidos (como Zernio).
adminApp.get("/comentarios", async (c) => c.html(await renderComentarios(c.env)));

// Contactos: todos los que interactúan (separados de Leads).
adminApp.get("/contactos", async (c) => c.html(await renderContactos(c.env)));

adminApp.post("/automatizaciones/save", async (c) => {
  try {
    const form = await c.req.formData();
    const input = parseRuleForm(form);
    if (input.keywords.length === 0 || !input.message) {
      return c.redirect("/admin/automatizaciones?error=keywords%20y%20mensaje%20son%20obligatorios");
    }
    const { Db } = await import("../db/client");
    const { checkLimit } = await import("../limits");
    const limitCheck = await checkLimit(c.env, "rules");
    if (!limitCheck.allowed) {
      return c.redirect(
        "/admin/automatizaciones?error=" +
          encodeURIComponent(`Límite gratis de reglas alcanzado (${limitCheck.used}/${limitCheck.limit}). Activa Pro en Licencia para quitarlo.`),
      );
    }
    await new AutoRulesRepo(new Db(c.env.DB)).create(input);
    return c.redirect("/admin/automatizaciones?saved=1");
  } catch (e) {
    return c.redirect("/admin/automatizaciones?error=" + encodeURIComponent(String((e as Error)?.message ?? e)));
  }
});

// Editar una automatización: vista con el formulario precargado.
adminApp.get("/automatizaciones/:id/edit", async (c) => {
  const { Db } = await import("../db/client");
  const rule = await new AutoRulesRepo(new Db(c.env.DB)).get(c.req.param("id"));
  if (!rule) return c.redirect("/admin/automatizaciones?error=regla%20no%20encontrada");
  return c.html(await renderAutomatizaciones(c.env, false, undefined, rule));
});

// Guardar edición de una automatización.
adminApp.post("/automatizaciones/:id/save", async (c) => {
  try {
    const form = await c.req.formData();
    const input = parseRuleForm(form);
    if (input.keywords.length === 0 || !input.message) {
      return c.redirect("/admin/automatizaciones?error=keywords%20y%20mensaje%20son%20obligatorios");
    }
    const { Db } = await import("../db/client");
    const repo = new AutoRulesRepo(new Db(c.env.DB));
    await repo.update(c.req.param("id"), { ...input, isActive: undefined });
    return c.redirect("/admin/automatizaciones?saved=1");
  } catch (e) {
    return c.redirect("/admin/automatizaciones?error=" + encodeURIComponent(String((e as Error)?.message ?? e)));
  }
});

adminApp.post("/automatizaciones/:id/toggle", async (c) => {
  const { Db } = await import("../db/client");
  const repo = new AutoRulesRepo(new Db(c.env.DB));
  const rule = await repo.get(c.req.param("id"));
  if (rule) await repo.setActive(rule.id, !rule.isActive);
  return c.redirect("/admin/automatizaciones?saved=1");
});

adminApp.post("/automatizaciones/:id/delete", async (c) => {
  const { Db } = await import("../db/client");
  await new AutoRulesRepo(new Db(c.env.DB)).remove(c.req.param("id"));
  return c.redirect("/admin/automatizaciones?saved=1");
});

adminApp.get("/campanas", async (c) => {
  const q: Record<string, string | undefined> = {
    ok: c.req.query("ok"),
    err: c.req.query("err"),
    ff: c.req.query("ff"),
    tp: c.req.query("tp"),
    dup: c.req.query("dup"),
    quota: c.req.query("quota"),
    fail: c.req.query("fail"),
  };
  return c.html(await renderCampanas(c.env, q));
});

adminApp.post("/campanas/send", async (c) => {
  const form = await c.req.formData();
  const segmentId = String(form.get("segment") ?? "");
  const campaignKey = String(form.get("campaign_key") ?? "").trim();
  const freeformText = String(form.get("freeform_text") ?? "").trim();
  const templateSid = String(form.get("template_sid") ?? "").trim();
  const varsRaw = String(form.get("template_vars") ?? "").trim();
  if (!segmentId || !campaignKey || (!freeformText && !templateSid)) {
    return c.redirect("/admin/campanas?err=" + encodeURIComponent("Falta el segmento, el nombre de campaña, o un mensaje/plantilla."));
  }
  let variables: Record<string, string> | undefined;
  if (varsRaw) {
    try {
      variables = JSON.parse(varsRaw);
    } catch {
      return c.redirect("/admin/campanas?err=" + encodeURIComponent("Las variables no son JSON válido."));
    }
  }
  // El body de la plantilla viaja al historial de cada conversación — sin él,
  // el agente no sabría qué se le preguntó al cliente cuando responda.
  let templateBody: string | undefined;
  if (templateSid) {
    const { listContentTemplates } = await import("../campaigns");
    const tpl = (await listContentTemplates(c.env).catch(() => [])).find((t) => t.sid === templateSid);
    templateBody = tpl?.body || undefined;
  }
  const result = await sendCampaign(c.env, {
    segmentId,
    campaignKey,
    freeformText: freeformText || undefined,
    template: templateSid ? { sid: templateSid, variables, body: templateBody } : undefined,
  });
  const q = new URLSearchParams({
    ok: "1",
    ff: String(result.sentFreeform),
    tp: String(result.sentTemplate),
    dup: String(result.skippedDuplicate),
    quota: String(result.skippedQuota),
    fail: String(result.failed),
  });
  return c.redirect("/admin/campanas?" + q.toString());
});

adminApp.get("/config", async (c) => {
  const settings = await new SettingsRepo(new Db(c.env.DB)).all();
  const saved = c.req.query("saved") === "1";
  return c.html(await renderConfig(c.env, settings, saved, c.req.query("llmtest")));
});

// Botón "Enviar prueba ahora" del Reporte nocturno: manda el resumen del día
// por el canal configurado (aunque el reporte esté apagado) y vuelve con el
// resultado en la query para el banner de la sección.
adminApp.post("/config/report-test", async (c) => {
  try {
    const { isModuleUnlocked } = await import("../modules");
    if (!(await isModuleUnlocked(c.env, "nightly_report"))) {
      return c.redirect("/admin/extras?report=" + encodeURIComponent("err:El módulo Reporte nocturno no está activado en esta instalación. Actívalo en la pestaña Licencia o pídelo a tu proveedor."));
    }
    const { sendReportTest } = await import("../reports/nightly");
    const res = await sendReportTest(c.env);
    if (res.sentTo.length === 0) {
      return c.redirect("/admin/extras?report=" + encodeURIComponent("err:No hay ningún canal configurado (Telegram o correo). Revisa Conexiones y los secrets."));
    }
    return c.redirect("/admin/extras?report=ok:" + res.sentTo.join("+"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.redirect(`/admin/extras?report=${encodeURIComponent(`err:${msg.slice(0, 160)}`)}`);
  }
});

// Prueba de la config BYO-LLM guardada: un generateText mínimo con el modelo
// resuelto (settings > env). Redirige de vuelta con el resultado en la query.
adminApp.get("/config/llm-test", async (c) => {
  try {
    const ov = await loadLlmOverrides(c.env);
    const { model, modelId, provider } = createModel(c.env, "fast", ov);
    const r = await generateText({
      model,
      prompt: "Responde únicamente: ok",
      maxOutputTokens: 8,
    });
    const okText = r.text.trim().slice(0, 20) || "ok";
    return c.redirect(
      `/admin/config?llmtest=${encodeURIComponent(`ok:${provider}/${modelId} → "${okText}"`)}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.redirect(`/admin/config?llmtest=${encodeURIComponent(`err:${msg.slice(0, 180)}`)}`);
  }
});

// Save the control panel. Card selections are mapped from the picked option
// (value or label) back to the value we persist via `levelToValue`; free-text
// fields are stored verbatim (trimmed). Empty/absent => default at load time.
adminApp.post("/config", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));

  // Card-based controls: tone, buffer_seconds, max_chunks, model_override, bot_paused.
  for (const key of Object.keys(CONTROLS)) {
    const picked = form.get(key);
    if (picked === null) continue; // control not submitted — leave as-is
    const value = levelToValue(key, String(picked));
    if (value !== null) await repo.set(key, value);
  }

  // Free-text controls (stored verbatim, trimmed).
  const textKeys: SettingKey[] = [
    SETTING_KEYS.botName,
    SETTING_KEYS.businessContext,
    SETTING_KEYS.systemPromptOverride,
    SETTING_KEYS.escalationKeywords,
    SETTING_KEYS.menuButtons,
    SETTING_KEYS.resourceLibrary,
    SETTING_KEYS.allowMultimedia,
  ];
  for (const key of textKeys) {
    const raw = form.get(key);
    if (raw === null) continue;
    await repo.set(key, String(raw).trim());
  }

  // Persona del bot (¿asistente o el dueño mismo en primera persona?).
  const personaRaw = form.get(SETTING_KEYS.agentPersona);
  if (personaRaw !== null) {
    await repo.set(SETTING_KEYS.agentPersona, String(personaRaw).trim() === "dueño" ? "dueño" : "");
  }

  // BYO-LLM: proveedor y modelo se guardan tal cual (allow-list de valores).
  const provRaw = form.get(SETTING_KEYS.llmProvider);
  if (provRaw !== null) {
    const v = String(provRaw).trim().toLowerCase();
    await repo.set(
      SETTING_KEYS.llmProvider,
      v === "anthropic" || v === "openai" || v === "xai" || v === "minimax" || v === "aisa" ? v : "",
    );
  }
  const baseUrlRaw = form.get(SETTING_KEYS.llmApiBaseUrl);
  if (baseUrlRaw !== null) {
    await repo.set(SETTING_KEYS.llmApiBaseUrl, String(baseUrlRaw).trim().slice(0, 200));
  }
  const modelRaw = form.get(SETTING_KEYS.llmModel);
  if (modelRaw !== null) {
    await repo.set(SETTING_KEYS.llmModel, String(modelRaw).trim().slice(0, 100));
  }
  // La API key SOLO se sobreescribe si escribieron algo (el input siempre
  // llega vacío cuando no la tocaron); el checkbox la borra explícitamente.
  if (form.get("llm_api_key_clear") === "1") {
    await repo.set(SETTING_KEYS.llmApiKey, "");
  } else {
    const keyRaw = form.get(SETTING_KEYS.llmApiKey);
    if (keyRaw !== null && String(keyRaw).trim() !== "") {
      await repo.set(SETTING_KEYS.llmApiKey, String(keyRaw).trim());
    }
  }

  return c.redirect("/admin/config?saved=1");
});

// --- CSV export -------------------------------------------------------------

adminApp.get("/leads/export.csv", async (c) => {
  const csv = await exportLeadsCsv(c.env);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${Date.now()}.csv"`,
    },
  });
});

// --- Mutating actions (HTMX / plain form posts) -----------------------------

const LEAD_STATUSES: ReadonlyArray<Lead["status"]> = ["new", "contacted", "sold", "lost"];

// Mark a lead's status (nuevo / contactado / vendido / perdido).
adminApp.post("/leads/:id/status", async (c) => {
  const form = await c.req.formData();
  const raw = String(form.get("status") ?? "new");
  const status: Lead["status"] = (LEAD_STATUSES as readonly string[]).includes(raw)
    ? (raw as Lead["status"])
    : "new";
  const leads = new LeadsRepo(new Db(c.env.DB));
  await leads.setStatus(c.req.param("id"), status);
  return c.redirect("/admin/leads");
});

// Resolve a support ticket.
adminApp.post("/tickets/:id/resolve", async (c) => {
  const form = await c.req.formData();
  const resolvedBy = String(form.get("resolved_by") ?? c.env.OWNER_EMAIL ?? "admin").trim() || "admin";
  const tickets = new TicketsRepo(new Db(c.env.DB));
  await tickets.resolve(c.req.param("id"), resolvedBy);
  return c.redirect("/admin/tickets");
});

// --- Inbox actions (F1) -------------------------------------------------------

/** Owner takes over for this long after replying/pausing from the dashboard. */
const TAKEOVER_MS = 60 * 60 * 1000;

// Reply AS A HUMAN from the dashboard: sends through the conversation's channel
// adapter (Twilio/Telegram/Meta/ManyChat), persists the message as role=owner,
// and pauses the bot (owner takeover — same behavior as isOwnerMessage in the
// agent). Returns a status line for #send-status plus an out-of-band swap that
// refreshes #thread-live instantly. X-Sent: 1 tells the composer to reset.
adminApp.post("/conversations/:id/reply", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData().catch(() => null);
  const text = String(form?.get("text") ?? "").trim();
  if (!text) return c.html(`<span class="text-stone-400">Escribe un mensaje primero.</span>`);

  const db = new Db(c.env.DB);
  const convs = new ConversationsRepo(db);
  const conv = await convs.getById(id);
  if (!conv) return c.html(`<span class="text-red-600">✗ Conversación no encontrada.</span>`);

  try {
    const adapter = pickAdapter(conv.channel as ChannelId);
    await adapter.sendReply(
      {
        channel: conv.channel as ChannelId,
        channelUserId: conv.channel_user_id,
        chunks: [text],
        interChunkDelayMs: 0,
      },
      c.env,
    );
  } catch (e) {
    // Nothing persisted on failure: the customer never got the message.
    const msg = e instanceof Error ? e.message : String(e);
    return c.html(`<span class="text-red-600">✗ No se pudo enviar: ${escapeHtml(msg)}</span>`);
  }

  const msgs = new MessagesRepo(db);
  await msgs.append(id, "owner", text);
  await convs.touchLastMessage(id);
  await convs.setPausedUntil(id, Date.now() + TAKEOVER_MS);

  c.header("X-Sent", "1");
  return c.html(
    `<span class="text-emerald-600">✓ Enviado por ${escapeHtml(channelLabel(conv.channel))}</span>` +
      `<div id="thread-live" hx-swap-oob="innerHTML">${await renderThreadLive(c.env, id)}</div>`,
  );
});

// Pause the bot in this conversation without sending anything (owner wants the
// customer for themselves). Returns the refreshed thread fragment.
adminApp.post("/conversations/:id/pause", async (c) => {
  const id = c.req.param("id");
  const convs = new ConversationsRepo(new Db(c.env.DB));
  await convs.setPausedUntil(id, Date.now() + TAKEOVER_MS);
  return c.html(await renderThreadLive(c.env, id));
});

// Return a paused conversation back to the bot. Clears paused_until AND appends
// an owner-authored summary of the human handoff to the message history, so the
// bot resumes with context about what the owner already resolved.
adminApp.post("/conversations/:id/resume", async (c) => {
  const id = c.req.param("id");
  const convs = new ConversationsRepo(new Db(c.env.DB));
  await convs.setPausedUntil(id, null);
  // Insert a system-style owner note summarizing the human handoff so the bot
  // has context when it picks the conversation back up. The summary field is
  // optional, so tolerate a request with no form body (formData() throws on an
  // empty/no-content-type body).
  //
  // Devolver el bot NO depende de mandar el formulario: la barra lo hace en el
  // PRIMER clic. El cuadro que se abre después es opcional —sirve para contarle
  // al bot algo que pasó fuera del chat— y se puede cerrar sin enviar nada.
  //
  // Por eso, cuando la petición viene de HTMX y sin nota se responde vacío:
  // redibujar el hilo cerraría ese cuadro a media frase.
  //
  // Y la nota se guarda SOLO si de verdad se escribió algo: antes se metía una
  // de oficio y en el chat aparecía un mensaje que nadie había escrito.
  const form = await c.req.formData().catch(() => null);
  const summary = String(form?.get("summary") ?? "").trim();
  if (summary) {
    const msgs = new MessagesRepo(new Db(c.env.DB));
    await msgs.append(id, "owner", summary);
  }
  if (c.req.header("HX-Request") && !summary) return c.body(null, 204);
  return c.redirect(`/admin/conversations?c=${encodeURIComponent(id)}`);
});

// --- Co-pilot (HTMX-driven suggestion) --------------------------------------

/** Escape untrusted text (LLM output) before interpolating into an HTML fragment. */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

// "Suggest Reply": call Anthropic with the recent conversation history + the
// business context and return ONE short message the owner can copy/paste (or
// send manually via WhatsApp). It does NOT send anything to the customer — it
// only returns an HTML fragment for HTMX to swap into the suggestion area.
//
// Auth: already enforced by the wildcard Basic Auth middleware above, so there
// is no per-route auth check here (no magic-link `requireAuth`).
adminApp.post("/conversations/:id/suggest", async (c) => {
  const msgs = new MessagesRepo(new Db(c.env.DB));
  const history = await msgs.lastN(c.req.param("id"), 20);
  const { model } = createModel(c.env, "fast", await loadLlmOverrides(c.env));
  const aiMessages = history.map((m) => ({
    role: (m.role === "tool" ? "user" : m.role === "owner" ? "assistant" : m.role) as
      | "user"
      | "assistant",
    content: m.content,
  }));
  aiMessages.push({
    role: "user",
    content:
      "Eres asistente del dueño. Sugiere UN solo mensaje corto en español que el dueño podría enviar al cliente para resolver la última consulta. NO incluyas preámbulo, solo la frase a copy/paste.",
  });
  const sys = systemPromptFromEnv(c.env, [], renderBusinessContext());
  const result = await generateText({
    model,
    system: sys,
    messages: aiMessages,
  });
  // HTMX swaps this into #suggestion-box; the "Usar" button fills the composer.
  return c.html(renderSuggestionBox(result.text));
});

// --- Fallback ---------------------------------------------------------------

adminApp.notFound(async (c) =>
  c.html(
    await layout({
      title: "No encontrado",
      activeTab: "overview",
      body: "<p class='text-stone-500'>Página no encontrada.</p>",
    }),
    404,
  ),
);
