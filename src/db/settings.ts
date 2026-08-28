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
  llmProvider: "llm_provider", // "" (auto) | anthropic | openai
  llmApiKey: "llm_api_key", // owner's API key; empty = use the env key
  llmModel: "llm_model", // concrete model id; empty = auto tiers (fast⇄smart)
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
  // Reporte nocturno (Forja+): resumen del día al dueño, configurable desde
  // /admin/config → "Reporte nocturno".
  nightlyReportEnabled: "nightly_report_enabled", // "0" | "1"
  nightlyReportChannel: "nightly_report_channel", // telegram | email | both
  // Módulos de pago desbloqueados por override del DUEÑO de la plataforma
  // (JSON array de ids; se setea directo en D1 — no aparece en el panel).
  moduleUnlocks: "module_unlocks",
  // Toggles del menú Extras (Forja+): el dueño enciende/apaga cada función.
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
  // Config de funciones de Extras (enlaces que el bot inyecta al prompt).
  reviewLink: "review_link", // link de reseñas de Google (Pide reseñas)
  paymentLink: "payment_link", // link de pago seguro (Cobros por WhatsApp)
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
