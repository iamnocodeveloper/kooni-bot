// Cobros por voz — credenciales de los proveedores de llamadas con IA
// (Vapi y Retell) para la cartera de cobros.
//
// Mismo patrón que Zernio/WAHA/Telegram: el panel guarda todo en `settings`
// (D1) para conectar sin `wrangler secret put` ni redeploy; si está vacío, cae
// al env (bots viejos/CI). Por ahora es SOLO configuración: deja los campos
// listos para cuando se cablee el flujo de llamadas (disparar la llamada,
// recibir el webhook con el resultado y registrarlo en la cartera).
//
// API reales (para la fase de integración):
//   Vapi   → POST {base}/call            (Authorization: Bearer <apiKey>)
//            Webhook servidor: header X-Vapi-Secret
//   Retell → POST {base}/v2/create-phone-call (Authorization: Bearer <apiKey>)
//            Webhook: verificación con el webhook secret del dashboard

import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";

export const VAPI_DEFAULT_BASE = "https://api.vapi.ai";
export const RETELL_DEFAULT_BASE = "https://api.retellai.com";

export interface VapiConfig {
  apiKey?: string;
  assistantId?: string;
  phoneNumberId?: string;
  webhookSecret?: string;
  baseUrl: string;
}

export interface RetellConfig {
  apiKey?: string;
  agentId?: string;
  phoneNumber?: string;
  webhookSecret?: string;
  baseUrl: string;
}

export type VoiceProvider = "" | "vapi" | "retell";

export interface VoiceConfig {
  /** Proveedor activo de la cartera de cobros. "" = ninguno. */
  provider: VoiceProvider;
  vapi: VapiConfig;
  retell: RetellConfig;
  /** Objetivo/tono del guion de cobranza (contexto para el agente de voz). */
  objective: string;
  /** Intentos máximos de llamada por deudor (default 3). */
  maxAttempts: number;
}

/** ¿Vapi está listo para llamar? (API key + assistant + número saliente). */
export function vapiConfigured(c: VapiConfig): boolean {
  return Boolean(c.apiKey && c.assistantId && c.phoneNumberId);
}

/** ¿Retell está listo para llamar? (API key + agente). */
export function retellConfigured(c: RetellConfig): boolean {
  return Boolean(c.apiKey && c.agentId);
}

/** ¿El proveedor activo está completo? */
export function voiceConfigured(v: VoiceConfig): boolean {
  if (v.provider === "vapi") return vapiConfigured(v.vapi);
  if (v.provider === "retell") return retellConfigured(v.retell);
  return false;
}

function pick(settings: Record<string, string>, key: string): string | undefined {
  const v = settings[key];
  return v !== undefined && v.trim() !== "" ? v.trim() : undefined;
}

/** Extrae la config de voz de un snapshot de settings (overlay del panel). */
export function voiceOverridesFrom(settings: Record<string, string>): Partial<VoiceConfig> & {
  vapi: VapiConfig;
  retell: RetellConfig;
} {
  const provider = pick(settings, SETTING_KEYS.voiceProvider) as VoiceProvider | undefined;
  return {
    provider: provider === "vapi" || provider === "retell" ? provider : "",
    vapi: {
      apiKey: pick(settings, SETTING_KEYS.vapiApiKey),
      assistantId: pick(settings, SETTING_KEYS.vapiAssistantId),
      phoneNumberId: pick(settings, SETTING_KEYS.vapiPhoneNumberId),
      webhookSecret: pick(settings, SETTING_KEYS.vapiWebhookSecret),
      baseUrl: pick(settings, SETTING_KEYS.vapiApiBaseUrl) ?? VAPI_DEFAULT_BASE,
    },
    retell: {
      apiKey: pick(settings, SETTING_KEYS.retellApiKey),
      agentId: pick(settings, SETTING_KEYS.retellAgentId),
      phoneNumber: pick(settings, SETTING_KEYS.retellPhoneNumber),
      webhookSecret: pick(settings, SETTING_KEYS.retellWebhookSecret),
      baseUrl: pick(settings, SETTING_KEYS.retellApiBaseUrl) ?? RETELL_DEFAULT_BASE,
    },
    objective: pick(settings, SETTING_KEYS.cobrosVoiceObjective) ?? "",
    maxAttempts: Number(pick(settings, SETTING_KEYS.cobrosVoiceMaxAttempts) ?? 3) || 3,
  };
}

/** Resuelve la config efectiva: settings de D1 gana; env como fallback. */
export async function resolveVoiceConfig(env: Env): Promise<VoiceConfig> {
  let settings: Record<string, string> = {};
  try {
    settings = await new SettingsRepo(new Db(env.DB)).all();
  } catch {
    settings = {};
  }
  const o = voiceOverridesFrom(settings);
  const provider = (o.provider ?? ("" as VoiceProvider)) || "";
  return {
    provider,
    vapi: {
      apiKey: o.vapi.apiKey ?? env.VAPI_API_KEY,
      assistantId: o.vapi.assistantId ?? env.VAPI_ASSISTANT_ID,
      phoneNumberId: o.vapi.phoneNumberId ?? env.VAPI_PHONE_NUMBER_ID,
      webhookSecret: o.vapi.webhookSecret ?? env.VAPI_WEBHOOK_SECRET,
      baseUrl: o.vapi.baseUrl || env.VAPI_API_BASE_URL || VAPI_DEFAULT_BASE,
    },
    retell: {
      apiKey: o.retell.apiKey ?? env.RETELL_API_KEY,
      agentId: o.retell.agentId ?? env.RETELL_AGENT_ID,
      phoneNumber: o.retell.phoneNumber ?? env.RETELL_PHONE_NUMBER,
      webhookSecret: o.retell.webhookSecret ?? env.RETELL_WEBHOOK_SECRET,
      baseUrl: o.retell.baseUrl || env.RETELL_API_BASE_URL || RETELL_DEFAULT_BASE,
    },
    objective: o.objective ?? "",
    maxAttempts: o.maxAttempts ?? 3,
  };
}
