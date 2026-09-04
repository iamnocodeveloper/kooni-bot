import { Db } from "./client";
import { currentActor, recordAudit, redactValue } from "../audit/context";

// Canonical setting keys. Every value is stored as TEXT; the loader parses.
// Empty/absent => default (see settings-loader.ts).
export const SETTING_KEYS = {
  systemPromptOverride: "system_prompt_override",
  // Reglas del dueño que se SUMAN al prompt generado; NO lo reemplazan (eso es
  // system_prompt_override). Es el campo seguro para "siempre ofrece agendar
  // cita" sin perder el contexto del negocio, el playbook ni el KB.
  customInstructions: "custom_instructions",
  businessContext: "business_context",
  botName: "bot_name",
  tone: "tone",
  // KB: score mínimo (0–1) para que un fragmento de searchKb cuente como match.
  // Default 0.45 (ver KB_MIN_SCORE_DEFAULT en src/kb/query.ts). Súbelo si el bot
  // cita cosas irrelevantes; bájalo si dice "no tengo info" con la KB llena.
  kbMinScore: "kb_min_score",
  bufferSeconds: "buffer_seconds",
  maxChunks: "max_chunks",
  interChunkDelayMs: "inter_chunk_delay_ms",
  escalationKeywords: "escalation_keywords",
  modelOverride: "model_override", // auto | haiku | sonnet
  botPaused: "bot_paused", // 0 | 1 — pausa global (todas las conversaciones)
  pausedChannels: "paused_channels", // JSON array: canales pausados (ej. ["telegram"])
  disabledTools: "disabled_tools", // comma-separated tool names turned off from the dashboard
  temperature: "temperature", // LLM sampling temperature 0-1; empty = provider default
  monthlyBudget: "monthly_budget", // USD cap for monthly AI spend; empty = no cap
  learnedLessons: "learned_lessons", // JSON array of rules distilled from owner takeovers
  twilioHandoffContentSid: "twilio_handoff_content_sid", // HSM del aviso de handoff (fallback del secret)
  autonomyLevel: "autonomy_level", // flywheel: manual (default) | copilot (auto-aplica lo seguro de noche)
  // BYO-LLM (dashboard "Modelo de IA"): the owner plugs their own provider,
  // API key and/or concrete model. Empty = the instance's env defaults.
  llmProvider: "llm_provider", // "" (auto) | anthropic | openai | minimax | aisa
  llmApiKey: "llm_api_key", // owner's API key; empty = use the env key
  llmModel: "llm_model", // concrete model id; empty = auto tiers (fast⇄smart)
  llmApiBaseUrl: "llm_api_base_url", // gateway URL (AIsa/OpenRouter); empty = env
  proLicense: "pro_license", // código KOONI-PRO-... pegado en el panel (quita límites)
  // Botones y multimedia (Fase A): activable desde Configuración.
  menuButtons: "menu_buttons", // JSON: botones del menú que se envían al saludo
  resourceLibrary: "resource_library", // JSON: biblioteca de recursos (imagen/audio/botones)
  allowMultimedia: "allow_multimedia", // "0" | "1": permite que el bot envíe imagen/audio/botones
  // Zernio (multicanal): API key + webhook secret editables desde el panel.
  // Viven en settings para conectar el canal SIN `wrangler secret put` ni redeploy.
  zernioApiKey: "zernio_api_key",
  zernioWebhookSecret: "zernio_webhook_secret",
  // Telegram: token del bot editable desde el panel (mismo patrón que Zernio).
  telegramBotToken: "telegram_bot_token",
  // Avisos al dueño (handoff) por Telegram DM: chat_id del dueño editable desde
  // el panel (Conexiones → card Telegram). Fallback al secret OWNER_TELEGRAM_CHAT_ID.
  ownerTelegramChatId: "owner_telegram_chat_id",
  // ── MercadoLibre (preguntas + mensajería post-venta) ────────────────────
  // App OAuth propia del dueño (una por cuenta de vendedor). TODO el estado del
  // canal vive en settings para conectarlo sin `wrangler secret put` ni redeploy.
  mlClientId: "ml_client_id", // App ID de la app en developers.mercadolibre.com
  mlClientSecret: "ml_client_secret", // Secret Key de esa app
  mlSite: "ml_site", // país: MLA | MLM | MLB | MLC | MCO | MLU | MPE | ...
  mlAccessToken: "ml_access_token", // token de acceso (vigencia ~6h; se refresca solo)
  mlRefreshToken: "ml_refresh_token", // refresh token (rotativo, de un solo uso)
  mlUserId: "ml_user_id", // id del vendedor (viene del token)
  mlNickname: "ml_nickname", // nombre visible del vendedor (para el panel)
  mlTokenExpiresAt: "ml_token_expires_at", // epoch ms de expiración del access token
  mlOauthState: "ml_oauth_state", // anti-CSRF del flujo OAuth (efímero)
  // Reporte nocturno (Kooni+): resumen del día al dueño, configurable desde
  // /admin/config → "Reporte nocturno".
  nightlyReportEnabled: "nightly_report_enabled", // "0" | "1"
  nightlyReportChannel: "nightly_report_channel", // telegram | email | both
  // Módulos de pago desbloqueados por override del DUEÑO de la plataforma
  // (JSON array de ids; se setea directo en D1 — no aparece en el panel).
  moduleUnlocks: "module_unlocks",
  // Toggles del menú Extras (Kooni+): el dueño enciende/apaga cada función.
  featureBlindaje: "feature_blindaje_enabled", // "0" | "1"
  featureVigilante: "feature_vigilante_enabled", // "0" | "1"
  featureHandoff: "feature_handoff_enabled", // "0" | "1"
  featureCazador: "feature_cazador_enabled", // "0" | "1"
  featureOidoVista: "feature_oido_vista_enabled", // "0" | "1"
  featureVozMarca: "feature_voz_marca_enabled", // "0" | "1"
  featureMultiidioma: "feature_multiidioma_enabled", // "0" | "1"
  featureEncuestas: "feature_encuestas_enabled", // "0" | "1"
  featureReenganche: "feature_reenganche_enabled", // "0" | "1"
  featureResenas: "feature_resenas_enabled", // "0" | "1"
  featureCobros: "feature_cobros_enabled", // "0" | "1"
  featureGaleria: "feature_galeria_enabled", // "0" | "1"
  // ¿El bot se presenta como el DUEÑO mismo (primera persona) o como asistente?
  agentPersona: "agent_persona", // "" (asistente) | "dueño"
  // Config de funciones de Extras (enlaces que el bot inyecta al prompt).
  reviewLink: "review_link", // link de reseñas de Google (Pide reseñas)
  paymentLink: "payment_link", // link de pago seguro (Cobros por WhatsApp)
  // Comentarios SIN automatización: si está en "1", el bot responde EN PÚBLICO
  // (nunca DM) los comentarios de primer nivel que no matchean ninguna regla,
  // con el texto de commentFallbackMessage. Default "" (apagado = no hace nada).
  commentFallbackEnabled: "comment_fallback_enabled", // "0" | "1"
  commentFallbackMessage: "comment_fallback_message", // texto de la respuesta pública
  // Web Sync (módulo web_sync): páginas que se scrapean a la KB del bot.
  webSyncEnabled: "feature_web_sync_enabled", // "0" | "1"
  webSyncUrls: "web_sync_urls", // URLs (una por línea o coma)
  webSyncState: "web_sync_state", // JSON { [url]: { hash, at, chars } } — anti re-embebido
  webSyncLastRun: "web_sync_last_run", // epoch ms de la última corrida
  // WAHA (WhatsApp self-hosted, Docker): datos editables desde el panel
  // (Conexiones → WAHA), mismo patrón que Telegram/Zernio — sin
  // `wrangler secret put` ni redeploy. Fallback a las vars/secrets de env.
  wahaApiUrl: "waha_api_url", // http://<host>:3000 del servidor WAHA
  wahaSession: "waha_session", // nombre de sesión (default "default")
  wahaApiKey: "waha_api_key", // X-Api-Key de WAHA
  wahaWebhookToken: "waha_webhook_token", // ?token=... del webhook entrante (autogenerado)
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Etiqueta legible por clave de `settings` — para el registro de auditoría
 * (§ U). Las claves sin entrada aquí se muestran con su nombre técnico.
 */
export const SETTING_LABELS: Record<string, string> = {
  [SETTING_KEYS.systemPromptOverride]: "Prompt del sistema (reemplazo total)",
  [SETTING_KEYS.customInstructions]: "Instrucciones extra del dueño",
  [SETTING_KEYS.businessContext]: "Contexto del negocio",
  [SETTING_KEYS.botName]: "Nombre del bot",
  [SETTING_KEYS.tone]: "Tono del bot",
  [SETTING_KEYS.kbMinScore]: "Umbral de score de la KB",
  [SETTING_KEYS.bufferSeconds]: "Segundos de buffer",
  [SETTING_KEYS.maxChunks]: "Máximo de mensajes por respuesta",
  [SETTING_KEYS.interChunkDelayMs]: "Pausa entre mensajes (ms)",
  [SETTING_KEYS.escalationKeywords]: "Palabras de escalamiento",
  [SETTING_KEYS.modelOverride]: "Modelo de IA (override)",
  [SETTING_KEYS.botPaused]: "Bot en pausa (global)",
  [SETTING_KEYS.pausedChannels]: "Canales pausados",
  [SETTING_KEYS.disabledTools]: "Herramientas desactivadas",
  [SETTING_KEYS.temperature]: "Temperatura del modelo",
  [SETTING_KEYS.monthlyBudget]: "Presupuesto mensual de IA (USD)",
  [SETTING_KEYS.learnedLessons]: "Lecciones aprendidas",
  [SETTING_KEYS.twilioHandoffContentSid]: "Plantilla HSM de handoff (Twilio)",
  [SETTING_KEYS.autonomyLevel]: "Nivel de autonomía (flywheel)",
  [SETTING_KEYS.llmProvider]: "Proveedor de IA",
  [SETTING_KEYS.llmApiKey]: "API key del proveedor de IA",
  [SETTING_KEYS.llmModel]: "Modelo de IA",
  [SETTING_KEYS.llmApiBaseUrl]: "URL base del proveedor de IA",
  [SETTING_KEYS.proLicense]: "Código de licencia Pro",
  [SETTING_KEYS.menuButtons]: "Botones del menú",
  [SETTING_KEYS.resourceLibrary]: "Biblioteca de recursos",
  [SETTING_KEYS.allowMultimedia]: "Permitir multimedia en respuestas",
  [SETTING_KEYS.zernioApiKey]: "API key de Zernio",
  [SETTING_KEYS.zernioWebhookSecret]: "Webhook secret de Zernio",
  [SETTING_KEYS.telegramBotToken]: "Token del bot de Telegram",
  [SETTING_KEYS.ownerTelegramChatId]: "Chat id del dueño (Telegram)",
  [SETTING_KEYS.mlClientId]: "App ID de MercadoLibre",
  [SETTING_KEYS.mlClientSecret]: "Secret Key de MercadoLibre",
  [SETTING_KEYS.mlSite]: "País de MercadoLibre",
  [SETTING_KEYS.mlAccessToken]: "Token de acceso de MercadoLibre",
  [SETTING_KEYS.mlRefreshToken]: "Refresh token de MercadoLibre",
  [SETTING_KEYS.mlUserId]: "Vendedor de MercadoLibre",
  [SETTING_KEYS.mlNickname]: "Nombre del vendedor (MercadoLibre)",
  [SETTING_KEYS.nightlyReportEnabled]: "Reporte nocturno activado",
  [SETTING_KEYS.nightlyReportChannel]: "Canal del reporte nocturno",
  [SETTING_KEYS.moduleUnlocks]: "Módulos de pago desbloqueados",
  [SETTING_KEYS.agentPersona]: "Persona del bot",
  [SETTING_KEYS.reviewLink]: "Link de reseñas",
  [SETTING_KEYS.paymentLink]: "Link de pago",
  [SETTING_KEYS.commentFallbackEnabled]: "Respuesta pública a comentarios sin regla",
  [SETTING_KEYS.commentFallbackMessage]: "Texto de la respuesta pública a comentarios",
  [SETTING_KEYS.webSyncEnabled]: "Web Sync activado",
  [SETTING_KEYS.webSyncUrls]: "URLs de Web Sync",
  [SETTING_KEYS.wahaApiUrl]: "URL del servidor WAHA",
  [SETTING_KEYS.wahaSession]: "Sesión de WAHA",
  [SETTING_KEYS.wahaApiKey]: "API key de WAHA",
  [SETTING_KEYS.wahaWebhookToken]: "Webhook token de WAHA",
};

/** Toggles del menú Extras (Kooni+) — etiquetas para el registro de auditoría. */
for (const [k, label] of [
  [SETTING_KEYS.featureBlindaje, "Extra: Blindaje"],
  [SETTING_KEYS.featureVigilante, "Extra: Vigilante"],
  [SETTING_KEYS.featureHandoff, "Extra: Handoff"],
  [SETTING_KEYS.featureCazador, "Extra: Cazador de ventas"],
  [SETTING_KEYS.featureOidoVista, "Extra: Oído y vista"],
  [SETTING_KEYS.featureVozMarca, "Extra: Voz de marca"],
  [SETTING_KEYS.featureMultiidioma, "Extra: Multiidioma"],
  [SETTING_KEYS.featureEncuestas, "Extra: Encuestas"],
  [SETTING_KEYS.featureReenganche, "Extra: Reenganche"],
  [SETTING_KEYS.featureResenas, "Extra: Pide reseñas"],
  [SETTING_KEYS.featureCobros, "Extra: Cobros"],
  [SETTING_KEYS.featureGaleria, "Extra: Galería"],
] as const) {
  SETTING_LABELS[k] = label;
}

export function settingLabel(key: string): string {
  return SETTING_LABELS[key] ?? key;
}

interface SettingRow {
  key: string;
  value: string;
}

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.first<SettingRow>(
      "SELECT value FROM settings WHERE key = ?",
      [key],
    );
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    // Registro de auditoría (§ U): si hay un operador del panel en contexto,
    // capturamos el valor anterior para el "antes → después". Fuera del panel
    // (bot / cron) no hay actor y esto no cuesta nada.
    const actor = currentActor();
    const before = actor ? await this.get(key) : null;

    await this.db.run(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, Date.now()],
    );

    if (actor && before !== value) {
      await recordAudit(this.db, {
        action: "settings.update",
        target: key,
        targetLabel: settingLabel(key),
        beforeVal: redactValue(key, before),
        afterVal: redactValue(key, value),
      });
    }
  }

  async all(): Promise<Record<string, string>> {
    const rows = await this.db.all<SettingRow>(
      "SELECT key, value FROM settings",
    );
    const out: Record<string, string> = {};
    for (const row of rows) {
      out[row.key] = row.value;
    }
    return out;
  }
}
