import { Hono } from "hono";
import type { Env } from "./env";
import type { ChannelAdapter } from "./channels/shared";
import { telegramAdapter } from "./channels/telegram";
import { manychatAdapter } from "./channels/manychat";
import { twilioAdapter } from "./channels/twilio";
import { parseMetaEvents, verifyMetaSignature } from "./channels/meta";
import { parseWhatsAppEvents, serveWhatsAppMedia } from "./channels/whatsapp";
import { parseZernioEvents, verifyZernioSignature } from "./channels/zernio";
import { resolveZernioCredentials } from "./channels/zernioCredentials";
import { adminApp } from "./admin/routes";
import { purgeOldMessages } from "./crons/purgeOldMessages";
import { DAILY_CRON, isNightlyTick } from "./crons/schedule";
import { reindexAll } from "./kb/docs";
import { analyzeConversations } from "./insights/analyzer";
import { Db } from "./db/client";
import { SettingsRepo, SETTING_KEYS } from "./db/settings";
import { detectKind } from "./learn/fieldPath";
import { saveCapture, isLearnMode } from "./learn/mapping";
import { tokensMatch, manychatWebhookAllowed } from "./http-auth";
import { apiApp } from "./api";

export { SupportAgent } from "./agent";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok", 200));

// Parse the provider payload via the channel adapter, derive the per-user DO id
// (channel + ':' + channelUserId), and forward the normalized message to the
// SupportAgent's `/ingest` endpoint. The DO buffers + schedules the alarm.
async function routeToAgent(c: { req: { raw: Request }; env: Env; text: (t: string, s: number) => Response }, adapter: ChannelAdapter) {
  try {
    const env = c.env;
    const msg = await adapter.parseIncoming(c.req.raw, env);
    const doId = env.AGENT.idFromName(`${msg.channel}:${msg.channelUserId}`);
    const stub = env.AGENT.get(doId);
    // Call the agent directly via RPC. Do NOT use stub.fetch(): the `agents` SDK
    // intercepts the Durable Object fetch and expects partyserver namespace/room
    // headers, so an ad-hoc fetch to /ingest fails to connect. RPC invokes the
    // method directly — it buffers the message and schedules the alarm.
    await stub.ingest(msg);
    // Twilio treats the webhook's HTTP body as a reply to send. The real reply
    // is delivered asynchronously via the REST API, so ack with empty TwiML
    // (`<Response></Response>`) to tell Twilio to send nothing. Other channels
    // ignore the body, so a plain "ok" is fine for them.
    if (msg.channel === "twilio") {
      return new Response("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }
    return c.text("ok", 200);
  } catch (e: any) {
    console.error("webhook error:", e);
    return c.text(`err: ${e?.message ?? e}`, 500);
  }
}

app.post("/webhooks/telegram", (c) => routeToAgent(c, telegramAdapter));

// Link trackeado (port OpenReply): /r/:slug → 302 al destino + registra click.
app.get("/r/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const { Db } = await import("./db/client");
    const { TrackedLinksRepo } = await import("./db/trackedLinks");
    const repo = new TrackedLinksRepo(new Db(c.env.DB));
    const ipHash = (c.req.header("cf-connecting-ip") ?? "").slice(0, 64) || null;
    const dest = await repo.registerClick(slug, ipHash);
    if (!dest) return c.text("not found", 404);
    return c.redirect(dest, 302);
  } catch (e) {
    console.error("/r/:slug error:", e);
    return c.text("not found", 404);
  }
});
// No-op until MANYCHAT_WEBHOOK_SECRET is set, so existing bots keep working.
app.post("/webhooks/manychat", (c) => {
  if (!manychatWebhookAllowed(c.req.raw, c.env)) {
    console.warn("manychat webhook rejected: missing or invalid X-Api-Key");
    return c.text("unauthorized", 401);
  }
  return routeToAgent(c, manychatAdapter);
});
// Zernio — proveedor unificado multicanal (IG/FB/X/TG/WhatsApp/Bluesky/Reddit…).
// Firma HMAC-SHA256 en X-Zernio-Signature (fail-closed si hay secreto
// configurado). Un POST puede traer DM entrantes (→ agente) o comentarios de
// posts (→ auto-DM por keyword, no entran al agente).
app.post("/webhooks/zernio", async (c) => {
  const raw = await c.req.text();
  const sig =
    c.req.header("x-zernio-signature") ?? c.req.header("x-late-signature");
  const { webhookSecret } = await resolveZernioCredentials(c.env);
  if (webhookSecret && !(await verifyZernioSignature(raw, sig, webhookSecret))) {
    console.warn("zernio webhook rejected: firma inválida");
    return c.text("unauthorized", 401);
  }
  try {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.text("ok", 200); // ack; body no-JSON (no es un evento de Zernio)
    }
    const msgs = await parseZernioEvents(body, c.env);
    for (const msg of msgs) {
      if (!msg.text && !msg.audioUrl && !msg.imageUrl) continue;
      const doId = c.env.AGENT.idFromName(`${msg.channel}:${msg.channelUserId}`);
      const stub = c.env.AGENT.get(doId);
      if (msg.ownerEcho) {
        await stub.recordOwnerEcho(msg).catch((e) => console.error("zernio ownerEcho:", e));
      } else {
        await stub.ingest(msg).catch((e) => console.error("zernio ingest:", e));
      }
    }
    return c.text("ok", 200);
  } catch (e: any) {
    console.error("zernio webhook error:", e);
    return c.text("ok", 200); // ack para que Zernio no reintente en loop
  }
});

// WhatsApp (Twilio): rutea el mensaje entrante al bot de clientes (Claude). El
// body se lee UNA vez; ack con TwiML vacío para que Twilio no reenvíe el cuerpo
// como mensaje.
app.post("/webhooks/twilio", async (c) => {
  let msg;
  try {
    msg = await twilioAdapter.parseIncoming(c.req.raw, c.env);
  } catch (e) {
    console.error("twilio parse error:", e);
    return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }
  const doId = c.env.AGENT.idFromName(`${msg.channel}:${msg.channelUserId}`);
  await c.env.AGENT.get(doId).ingest(msg).catch((e) => console.error("ingest:", e));
  return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
});

// WAHA (WhatsApp HTTP API — self-hosted): canal por INSTALACIÓN. Sin
// WAHA_API_URL el webhook devuelve 401 (canal apagado para esa instalación).
// Los mensajes entrantes van al agente; las respuestas salen por /api/sendText.
app.post("/webhooks/waha", async (c) => {
  const { verifyWahaWebhook, wahaAdapter } = await import("./channels/waha");
  if (!(await verifyWahaWebhook(c.req.raw, c.env))) {
    return c.text("unauthorized", 401);
  }
  try {
    const msg = await wahaAdapter.parseIncoming(c.req.raw, c.env);
    const doId = c.env.AGENT.idFromName(`${msg.channel}:${msg.channelUserId}`);
    await c.env.AGENT.get(doId).ingest(msg).catch((e) => console.error("waha ingest:", e));
    return c.text("ok", 200);
  } catch (e) {
    console.warn("waha webhook ignorado (no es un mensaje entrante):", e);
    return c.text("ok", 200); // ack para que WAHA no reintente en loop
  }
});

// --- MercadoLibre (preguntas en publicaciones + mensajería post-venta) -----
// MercadoLibre NO firma sus webhooks: manda solo un puntero
// { resource, topic, user_id }. Validamos que el user_id sea el del vendedor
// conectado (dentro de parseMercadoLibreEvents) y vamos a buscar el contenido
// con su token. Hay que responder 200 rápido: MercadoLibre reintenta si tarda.
app.post("/webhooks/mercadolibre", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.text("ok", 200); // ack; body no-JSON (no es una notificación)
  }
  try {
    const { parseMercadoLibreEvents } = await import("./channels/mercadolibre");
    const msgs = await parseMercadoLibreEvents(body, c.env);
    for (const msg of msgs) {
      const doId = c.env.AGENT.idFromName(`${msg.channel}:${msg.channelUserId}`);
      await c.env.AGENT.get(doId)
        .ingest(msg)
        .catch((e) => console.error("mercadolibre ingest:", e));
    }
  } catch (e) {
    console.error("mercadolibre webhook error:", e);
  }
  return c.text("ok", 200); // ack siempre para que MercadoLibre no reintente en loop
});

// GET = callback OAuth de MercadoLibre. El vendedor autoriza la app y ML lo
// devuelve aquí con ?code=&state=. Intercambiamos el code por tokens y los
// guardamos en settings. Ruta pública (ML redirige el navegador del vendedor).
app.get("/webhooks/mercadolibre/oauth", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const errParam = c.req.query("error");
  const base = (c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin).replace(/\/$/, "");
  const redirectUri = `${base}/webhooks/mercadolibre/oauth`;
  const fail = (m: string) => c.redirect(`/admin/conexiones?ml=error&msg=${encodeURIComponent(m)}`);

  if (errParam) return fail(`MercadoLibre no autorizó la app (${errParam}).`);
  if (!code) return fail("MercadoLibre no devolvió el código de autorización.");

  const { SettingsRepo, SETTING_KEYS } = await import("./db/settings");
  const repo = new SettingsRepo(new Db(c.env.DB));
  const savedState = await repo.get(SETTING_KEYS.mlOauthState);
  if (!savedState || savedState !== state) {
    return fail("La autorización no coincide (state inválido). Reintenta desde el panel.");
  }
  await repo.set(SETTING_KEYS.mlOauthState, "");

  const { exchangeMlCode } = await import("./channels/mercadolibreCredentials");
  const r = await exchangeMlCode(c.env, code, redirectUri);
  if (!r.ok) return fail(r.error);
  return c.redirect("/admin/conexiones?ml=saved");
});

// --- Meta oficial (Facebook Messenger + Instagram DMs, sin ManyChat) --------
// GET = handshake de verificación de Meta: devuelve hub.challenge si el
// hub.verify_token coincide con nuestro secreto. Se llama una vez al configurar
// el webhook en la app de Meta.
app.get("/webhooks/meta", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token && token === c.env.META_VERIFY_TOKEN) {
    return c.text(challenge ?? "", 200);
  }
  return c.text("forbidden", 403);
});

// POST = eventos de mensajes. Meta firma el cuerpo con el App Secret; validamos
// la firma (fail-closed) antes de procesar. Un POST puede traer varios mensajes
// (varias páginas/usuarios): rutea cada uno a su Durable Object. Responde 200
// rápido para que Meta no reintente.
app.post("/webhooks/meta", async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header("x-hub-signature-256");
  // Messenger (app de Facebook) e Instagram (IG Login) pueden firmar con App
  // Secrets DISTINTOS aunque sea la misma app de Meta. Aceptamos la firma si
  // cuadra con cualquiera de los dos secretos configurados (fail-closed si con
  // ninguno). Así un solo webhook /webhooks/meta sirve para ambos canales.
  const valid =
    (!!c.env.META_APP_SECRET && (await verifyMetaSignature(raw, sig, c.env.META_APP_SECRET))) ||
    (!!c.env.INSTAGRAM_APP_SECRET && (await verifyMetaSignature(raw, sig, c.env.INSTAGRAM_APP_SECRET)));
  if (!valid) return c.text("bad signature", 403);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.text("bad json", 400);
  }
  // Kill-switch del canal oficial de Instagram (IG_OFFICIAL="off"): se ignora
  // TODO lo de IG por esta vía (DMs) — el bot de IG vive únicamente en ManyChat
  // (decisión de diseño). Messenger (object === "page") no se ve
  // afectado. Para reactivar: quitar la var y redeploy.
  if ((body as { object?: string }).object === "instagram" && c.env.IG_OFFICIAL === "off") {
    return c.text("EVENT_RECEIVED", 200);
  }

  for (const msg of parseMetaEvents(body as any)) {
    // Anti-duplicado: cuando IG_DM_SOURCE="manychat", los DMs de Instagram
    // entran SOLO por el webhook de ManyChat — el canal oficial los ignora
    // (si no, cada DM se procesa DOBLE: 2x LLM, 2x respuestas al lead y
    // colisiones de rate limit en ráfagas de historias).
    if (msg.channel === "instagram" && c.env.IG_DM_SOURCE === "manychat") continue;
    const doId = c.env.AGENT.idFromName(`${msg.channel}:${msg.channelUserId}`);
    const stub = c.env.AGENT.get(doId);
    if (msg.ownerEcho) {
      await stub.recordOwnerEcho(msg).catch((e) => console.error("meta ownerEcho:", e));
    } else {
      await stub.ingest(msg);
    }
  }
  return c.text("EVENT_RECEIVED", 200);
});

// --- WhatsApp OFICIAL (Cloud API de Meta, sin Twilio/BSP) -------------------
// GET = handshake de verificación (igual que Meta). Acepta el WHATSAPP_VERIFY_TOKEN
// propio o, si no se configuró, cae al META_VERIFY_TOKEN (misma app de Meta).
app.get("/webhooks/whatsapp", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const expected = c.env.WHATSAPP_VERIFY_TOKEN || c.env.META_VERIFY_TOKEN;
  if (mode === "subscribe" && token && expected && token === expected) {
    return c.text(challenge ?? "", 200);
  }
  return c.text("forbidden", 403);
});

// POST = mensajes entrantes. Firma X-Hub-Signature-256 con el App Secret de
// WhatsApp (o el de Meta si comparten app). Un POST puede traer varios mensajes.
app.post("/webhooks/whatsapp", async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header("x-hub-signature-256");
  const secret = c.env.WHATSAPP_APP_SECRET || c.env.META_APP_SECRET;
  const valid = !!secret && (await verifyMetaSignature(raw, sig, secret));
  if (!valid) return c.text("bad signature", 403);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.text("bad json", 400);
  }
  const origin = c.env.DASHBOARD_BASE_URL || new URL(c.req.url).origin;
  for (const msg of await parseWhatsAppEvents(body as any, c.env, origin)) {
    const doId = c.env.AGENT.idFromName(`${msg.channel}:${msg.channelUserId}`);
    await c.env.AGENT.get(doId).ingest(msg);
  }
  return c.text("EVENT_RECEIVED", 200);
});

// Proxy FIRMADO del media entrante de WhatsApp Cloud (audio/imagen). Hace el
// media públicamente fetchable (para transcribe/vision) sin exponer el token.
app.get("/webhooks/whatsapp/media/:id", (c) =>
  serveWhatsAppMedia(c.req.param("id"), c.req.query("exp") ?? null, c.req.query("sig") ?? null, c.env),
);

// Universal webhook LEARN endpoint. When learn mode is ON for `:channel`, this
// captures a real payload (classified by media kind) so the bot can later infer
// where each field lives — instead of hardcoding one app's contract. It NEVER
// runs the LLM; it only observes. When learn mode is OFF it returns 409 so the
// caller knows nothing was captured.
app.post("/webhooks/learn/:channel", async (c) => {
  const channel = c.req.param("channel");
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid json" }, 400);
  }

  const repo = new SettingsRepo(new Db(c.env.DB));
  const kind = detectKind(payload);

  if (!(await isLearnMode(repo, channel))) {
    return c.json({ ok: false, error: "learn mode off" }, 409);
  }

  await saveCapture(repo, channel, kind, payload);
  return c.json({ ok: true, captured: kind, channel }, 200);
});

// Admin dashboard — sub-app en /admin/*, con login propio (cookie de sesión) o
// Basic Auth. Ver src/admin/auth.ts.
app.route("/admin", adminApp);

// Control-plane API — Bearer-guarded (CONTROL_PLANE_TOKEN) read-only sub-app
// mounted at /api/* for a future hosted control plane (health + metrics).
app.route("/api", apiApp);

// KB reindex — embeds scripts/kb-fixtures.json into Vectorize. Guarded by the
// KB_REINDEX_TOKEN secret via the X-Reindex-Token header.
//
// El orden importa, y no es el intuitivo:
//   1. pnpm kb:reindex        (regenera el manifiesto)
//   2. pnpm deploy
//   3. wrangler secret put KB_REINDEX_TOKEN     <- DESPUÉS del deploy
//   4. curl -X POST https://<worker>/kb/reindex -H "X-Reindex-Token: <token>"
//
// El secret va después del deploy porque un deploy posterior lo puede dejar sin
// efecto. Y aun haciéndolo en este orden, el paso 4 puede devolver
// `unauthorized` en el primer intento: el secret tarda unos segundos en
// propagarse por el edge. Esperar y reintentar resuelve — el token no está mal.
app.post("/kb/reindex", async (c) => {
  const provided = c.req.header("X-Reindex-Token") ?? "";
  const expected = c.env.KB_REINDEX_TOKEN ?? "";
  if (!expected) {
    // Distinto de "token equivocado", pero la respuesta es la misma a propósito:
    // decirle a quien llama que el Worker no tiene secret es regalarle
    // información. El aviso va al log, donde lo ve el dueño con `wrangler tail`
    // y nadie más. Sin esto, un secret que no propagó y un token mal copiado se
    // ven idénticos desde afuera.
    console.warn(
      "kb/reindex: KB_REINDEX_TOKEN no está configurado en este Worker (o todavía no propagó); toda llamada va a devolver unauthorized",
    );
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!tokensMatch(provided, expected)) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  // reindexAll = fragmentos del repo (kb-fixtures.json) + TODOS los documentos
  // que el dueño escribió en /admin/kb (tabla kb_docs). Antes solo reindexaba
  // los del repo, así que tras `kooni-bot update` los docs del panel quedaban
  // sin re-embeber.
  const r = await reindexAll(c.env);
  return c.json({ ok: true, indexed: r.indexed }, 200);
});

// Trigger manual del Web Sync (mismo token que /kb/reindex): scrapea ya las
// páginas configuradas → KB, sin esperar el tick nocturno ni entrar al panel.
app.post("/kb/web-sync", async (c) => {
  const expected = c.env.KB_REINDEX_TOKEN ?? "";
  if (!expected || !tokensMatch(c.req.header("X-Reindex-Token") ?? "", expected)) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const { runWebSync } = await import("./kb/webSync");
  const r = await runWebSync(c.env);
  return c.json({ ok: true, ...r }, 200);
});

app.notFound((c) => c.text("not found", 404));

// La raíz del worker redirige al panel: en cualquier dispositivo, entrar a la
// URL del bot sin /admin ya no da "not found" — va al login del panel.
app.get("/", (c) => c.redirect("/admin", 302));

// Trigger manual del reporte de uso (mismo token que /kb/reindex): permite al
// dueño forzar el envío al panel de licencias sin esperar el cron nocturno.
app.post("/usage/push", async (c) => {
  const provided = c.req.header("X-Reindex-Token") ?? "";
  const expected = c.env.KB_REINDEX_TOKEN ?? "";
  if (!expected || !tokensMatch(provided, expected)) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const { pushUsage } = await import("./usage");
  const r = await pushUsage(c.env);
  return c.json({ ok: r.ok, detail: r.detail }, r.ok ? 200 : 500);
});

export default {
  // Bind so Hono keeps its `this` when invoked as `worker.fetch(req, env, ctx)`
  // (both by the Cloudflare runtime and by tests). Passing `app.fetch` unbound
  // loses the receiver and throws "Cannot read properties of undefined".
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    app.fetch(request, env, ctx),
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    // Menú Extras (Kooni+): el Cazador de ventas (follow-up automático a leads
    // que se enfriaron) solo corre si el dueño lo encendió Y su módulo está
    // desbloqueado. Follow-up bot: UN mensaje breve de seguimiento a leads que
    // lo ameritan (venta abierta / 4+ preguntas), dentro de la ventana de 3-20h
    // y máximo una vez por conversación. Acotado por caps internos.
    const settings = await new SettingsRepo(new Db(env.DB)).all().catch(() => ({}));
    const { isFeatureActive } = await import("./features");
    if (await isFeatureActive(env, "cazador", settings)) {
      const { runFollowups } = await import("./followup/run");
      await runFollowups(env).catch((e) => console.error("followups:", e));
    }
    // Reenganche (Kooni+): segundo toque 2-5 días después del Cazador si el
    // cliente sigue sin contestar. Corre solo si está activo.
    if (await isFeatureActive(env, "reenganche", settings)) {
      const { runReengagements } = await import("./followup/reengage");
      await runReengagements(env).catch((e) => console.error("reenganche:", e));
    }

    // Watchdog: si el bot está fallando en cadena (3+ "Algo falló" en 30 min),
    // avisa al dueño por su canal de handoff. Throttle 6h. Lo ÚNICO que debe
    // despertarlo en la noche.
    const { checkBotHealth } = await import("./watchdog");
    await checkBotHealth(env).catch((e) => console.error("watchdog:", e));

    // Los trabajos nocturnos SOLO corren en el tick diario (3am UTC) — un tick
    // más frecuente (si el miembro lo configura) no debe purgar/analizar de más.
    // Ojo: si NINGÚN cron configurado es DAILY_CRON, estos trabajos no corren
    // nunca. Por eso se loguea el motivo, y por eso el test compara la constante
    // contra wrangler.toml.
    if (!isNightlyTick(event.cron)) {
      console.log(`cron ${event.cron}: se omiten los trabajos nocturnos (solo corren en "${DAILY_CRON}")`);
      return;
    }

    // Daily cron (wrangler.toml: "0 3 * * *") — purge messages older than 90 days.
    await purgeOldMessages(env);
    // Corrida nocturna del Analista de insights (F2). No debe tumbar la purga.
    await analyzeConversations(env, { limit: 50 }).catch((e) => console.error("insights:", e));
    // Reporte nocturno (Kooni+): resumen del día al dueño (Telegram/email),
    // configurable en /admin/config → "Reporte nocturno". Corre DESPUÉS del
    // análisis para que los insights del día ya estén frescos.
    const { sendNightlyReport } = await import("./reports/nightly");
    await sendNightlyReport(env).catch((e) => console.error("reporte nocturno:", e));
    // Flywheel (F5): detecta huecos de KB y lecciones de takeovers → propone
    // mejoras en /admin/mejoras. Corre DESPUÉS del analizador (usa su output).
    const { runFlywheel } = await import("./flywheel/detect");
    await runFlywheel(env).catch((e) => console.error("flywheel:", e));
    // Modo COPILOTO (autonomy_level="copilot"): auto-aplica las mejoras seguras
    // detectadas (lecciones + KB sin huecos). Lo delicado espera al dueño.
    try {
      const level = await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.autonomyLevel);
      if (level === "copilot") {
        const { autoApplyPending } = await import("./flywheel/apply");
        await autoApplyPending(env);
      }
    } catch (e) {
      console.error("copiloto:", e);
    }
    // Purga de avisos push viejos (>7 días) — la tabla es una cola chica.
    try {
      const { PushEventsRepo } = await import("./db/push");
      await new PushEventsRepo(new Db(env.DB)).purgeOld(Date.now() - 7 * 86_400_000);
    } catch (e) {
      console.warn("push_events purge:", e);
    }

    // Web Sync (módulo web_sync, una instalación): scrapea las páginas
    // configuradas → KB. No-op si el módulo está bloqueado o falta DECODO_AUTH.
    try {
      const { runWebSync } = await import("./kb/webSync");
      const r = await runWebSync(env);
      if (!r.skipped) console.log(`[webSync] noche: ${r.updated} actualizadas, ${r.unchanged} sin cambios, ${r.errors.length} errores`);
    } catch (e) {
      console.error("webSync:", e);
    }

    // Uso del sistema → panel de licencias del dueño (si USAGE_PUSH_URL está
    // definida): métricas agregadas + costos de IA. Fire-and-forget.
    const { pushUsage } = await import("./usage");
    await pushUsage(env);
  },
} satisfies ExportedHandler<Env>;
