import type { Env } from "./env";
import { Db } from "./db/client";
import { SettingsRepo, SETTING_KEYS } from "./db/settings";
import { systemPromptFromEnv } from "./system-prompt";
import { renderBusinessContext } from "./businessContext";
import { getBufferMs } from "./config";
import { getNiche } from "./niches";
import type { LlmOverrides } from "./llm/provider";
import type { ReplyButton } from "./channels/shared";

export type ModelOverride = "auto" | "haiku" | "sonnet";

export interface AgentConfig {
  systemPrompt: string;
  bufferMs: number;
  maxChunks: number;
  interChunkDelayMs: number;
  modelOverride: ModelOverride;
  botPaused: boolean;
  /** Canales pausados individualmente desde el panel (ej. ["telegram"]). Vacío = ninguno. */
  pausedChannels: string[];
  /** Tool names still enabled after applying the dashboard's disabled_tools. */
  enabledToolNames: string[];
  /** Sampling temperature (0-1). undefined = use the provider default. */
  temperature?: number;
  /** Monthly AI budget (USD). undefined = no cap. */
  monthlyBudgetUsd?: number;
  /** Fase A: si el dueño permitió que el bot envíe imagen/audio/botones. */
  allowMultimedia: boolean;
  /** Botones del menú (JSON parseado) que se adjuntan a cada respuesta. */
  menuButtons: ReplyButton[];
  /** BYO-LLM del dashboard (proveedor / API key / modelo). */
  llm: LlmOverrides;
  /** Menú Extras: Vigilante con IA activo (alerta al dueño sin pasar el chat). */
  vigilanteEnabled: boolean;
  /** Menú Extras: Oído y vista activo (transcribe audio / ve fotos). */
  oidoVistaEnabled: boolean;
  /** Menú Extras: Galería activa (envía recursos multimedia de la biblioteca). */
  galeriaEnabled: boolean;
}

/** Extract the BYO-LLM overrides from a settings snapshot. */
export function llmOverridesFrom(settings: Record<string, string>): LlmOverrides {
  const pick = (key: string): string | undefined => {
    const v = settings[key];
    return v !== undefined && v.trim() !== "" ? v.trim() : undefined;
  };
  return {
    provider: pick(SETTING_KEYS.llmProvider),
    apiKey: pick(SETTING_KEYS.llmApiKey),
    model: pick(SETTING_KEYS.llmModel),
    baseUrl: pick(SETTING_KEYS.llmApiBaseUrl),
  };
}

/** Load just the BYO-LLM overrides (para analyzer/flywheel/admin, fuera del agente).
 *  Nunca truena: si settings no está disponible, se usan los defaults del env. */
export async function loadLlmOverrides(env: Env): Promise<LlmOverrides> {
  try {
    const settings = await new SettingsRepo(new Db(env.DB)).all();
    return llmOverridesFrom(settings);
  } catch {
    return {};
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

function normalizeModelOverride(value: string | undefined): ModelOverride {
  if (value === "haiku" || value === "sonnet" || value === "auto") return value;
  return "auto";
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve the effective agent config by overlaying D1 `settings` on top of env
 * defaults. Anything empty/absent in settings falls back to the env/default.
 */
export async function resolveAgentConfig(env: Env, toolNames: string[]): Promise<AgentConfig> {
  const repo = new SettingsRepo(new Db(env.DB));
  const settings = await repo.all();

  const get = (key: string): string | undefined => {
    const v = settings[key];
    return v !== undefined && v.trim() !== "" ? v : undefined;
  };

  // Niche pack activo (BOT_NICHE). Aporta el playbook del giro y un tono por
  // defecto; ambos se pueden sobreescribir desde el panel.
  const niche = getNiche(env);

  const systemPromptOverride = get(SETTING_KEYS.systemPromptOverride);
  // Reglas del dueño que se SUMAN al prompt GENERADO (mismo trato que las
  // lecciones): con un override manual activo no aplican — el override es
  // "úsalo tal cual", y el panel lo advierte junto al campo.
  const customInstructions = get(SETTING_KEYS.customInstructions);
  // Sin Cal.com configurado: instrucción explícita para que el modelo NO
  // alucine reservas confirmadas (regla "nunca confirmes lo que no ejecutaste").
  const hasCalcom = Boolean(
    env.CALCOM_API_KEY && (env.CALCOM_EVENT_TYPE_ID || env.CALCOM_EVENT_TYPES),
  );
  const calcomNote = hasCalcom
    ? ""
    : "No hay agenda en línea configurada. NUNCA digas que agendaste, reservaste ni confirmaste una cita. " +
      "Si el cliente quiere agendar, pide los datos (día, hora, nombre, contacto) y captura el lead con captureLead; " +
      "avísale que el negocio le confirmará por mensaje.";
  // Menú Extras (Kooni+): Blindaje anti-inventos y Handoff inteligente inyectan
  // reglas al prompt generado; el Vigilante se enciende post-respuesta (ver
  // src/features.ts). Todo se SUMA al prompt automático — nunca lo reemplaza.
  const { extrasForAgent } = await import("./features");
  const extras = await extrasForAgent(env, settings);
  const instrParts: string[] = [];
  if (customInstructions) instrParts.push(customInstructions);
  if (calcomNote) instrParts.push(calcomNote);
  instrParts.push(...extras.extraInstructions);
  const finalInstructions = instrParts.join("\n\n");
  const businessContext = get(SETTING_KEYS.businessContext) ?? renderBusinessContext();
  const botName = get(SETTING_KEYS.botName) ?? env.BOT_NAME;
  // Tono elegido en el panel gana; si no hay, el tono por defecto del nicho.
  const tone = get(SETTING_KEYS.tone) ?? (niche.defaultTone || undefined);
  const escalationKeywords = parseCsvList(get(SETTING_KEYS.escalationKeywords));

  // Flywheel lessons (JSON array). Only injected into the GENERATED prompt —
  // a manual override replaces the whole prompt, lessons included.
  let lessons: string[] = [];
  try {
    const parsed = JSON.parse(get(SETTING_KEYS.learnedLessons) ?? "[]");
    if (Array.isArray(parsed)) lessons = parsed.filter((l) => typeof l === "string");
  } catch { /* malformed setting — ignore */ }

  // Dashboard tool toggles: the prompt only advertises the enabled tools, so
  // the model never tries to call something that was turned off.
  const disabledTools = parseCsvList(get(SETTING_KEYS.disabledTools));
  const enabledToolNames = toolNames.filter((n) => !disabledTools.includes(n));

  // ¿El bot se presenta como el DUEÑO (primera persona) o como asistente?
  const persona: "dueño" | "asistente" = get(SETTING_KEYS.agentPersona) === "dueño" ? "dueño" : "asistente";

  const systemPrompt =
    systemPromptOverride ??
    systemPromptFromEnv(env, enabledToolNames, businessContext, niche.playbook || undefined, {
      tone,
      extraEscalationKeywords: escalationKeywords,
      botName,
      lessons,
      customInstructions: finalInstructions,
      multiIdioma: extras.multiIdiomaEnabled,
      persona,
    });

  const bufferSecondsRaw = get(SETTING_KEYS.bufferSeconds);
  const bufferMs =
    bufferSecondsRaw !== undefined
      ? Math.max(1000, parseIntOr(bufferSecondsRaw, 1) * 1000)
      : getBufferMs(env);

  const maxChunks = clamp(parseIntOr(get(SETTING_KEYS.maxChunks), 3), 1, 5);
  const interChunkDelayMs = clamp(parseIntOr(get(SETTING_KEYS.interChunkDelayMs), 1000), 0, 5000);
  const modelOverride = normalizeModelOverride(get(SETTING_KEYS.modelOverride));
  const botPaused = get(SETTING_KEYS.botPaused) === "1";
  const allowMultimedia = get(SETTING_KEYS.allowMultimedia) === "1";

  // Botones del menú (JSON array): se adjuntan a cada respuesta si multimedia está activo.
  let menuButtons: ReplyButton[] = [];
  const menuRaw = get(SETTING_KEYS.menuButtons);
  if (menuRaw && allowMultimedia) {
    try {
      const parsed = JSON.parse(menuRaw);
      if (Array.isArray(parsed)) {
        menuButtons = parsed
          .map((b) => ({ text: String(b?.text ?? "").trim(), url: b?.url ? String(b.url) : undefined, callback: b?.callback ? String(b.callback) : undefined }))
          .filter((b) => b.text.length > 0);
      }
    } catch (e) {
      console.warn("[settings] menu_buttons JSON inválido:", e);
    }
  }

  // Canales pausados desde el panel (JSON array). Se chequean en ingest(): si
  // el canal del mensaje entrante está aquí, el bot no arma el alarm y queda
  // mudo SOLO en ese canal (el resto sigue activo).
  let pausedChannels: string[] = [];
  const pausedRaw = get(SETTING_KEYS.pausedChannels);
  if (pausedRaw) {
    try {
      const parsed = JSON.parse(pausedRaw);
      if (Array.isArray(parsed)) pausedChannels = parsed.map((c) => String(c)).filter(Boolean);
    } catch (e) {
      console.warn("[settings] paused_channels JSON inválido:", e);
    }
  }

  const tempRaw = get(SETTING_KEYS.temperature);
  let temperature: number | undefined;
  if (tempRaw !== undefined) {
    const t = Number.parseFloat(tempRaw);
    if (!Number.isNaN(t)) temperature = clamp(t, 0, 1);
  }

  const budgetRaw = get(SETTING_KEYS.monthlyBudget);
  let monthlyBudgetUsd: number | undefined;
  if (budgetRaw !== undefined) {
    const b = Number.parseFloat(budgetRaw);
    if (!Number.isNaN(b) && b > 0) monthlyBudgetUsd = b;
  }

  return {
    systemPrompt,
    bufferMs,
    maxChunks,
    interChunkDelayMs,
    modelOverride,
    botPaused,
    pausedChannels,
    enabledToolNames,
    temperature,
    monthlyBudgetUsd,
    allowMultimedia,
    menuButtons,
    llm: llmOverridesFrom(settings),
    vigilanteEnabled: extras.vigilanteEnabled,
    oidoVistaEnabled: extras.oidoVistaEnabled,
    galeriaEnabled: extras.galeriaEnabled,
  };
}
