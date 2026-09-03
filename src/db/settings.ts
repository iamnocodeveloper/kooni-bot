import { Db } from "./client";

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
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

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
    await this.db.run(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, Date.now()],
    );
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
