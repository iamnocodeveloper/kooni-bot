/**
 * Friendly channel names for the dashboard + detection of which channels are
 * actually configured (env credentials present). Kept separate from shared.ts
 * so dashboard concerns don't touch the adapter contract.
 */
import type { Env } from "../env";
import { resolveZernioCredentials } from "./zernioCredentials";
import { resolveTelegramToken } from "./telegramCredentials";
import { loadMlCredentials, mlConnected } from "./mercadolibreCredentials";
import { resolveWahaConfig } from "./wahaCredentials";
import { getNiche } from "../niches";

/** channel id (as stored in conversations.channel) → label the owner reads. */
export const CHANNEL_LABELS: Record<string, string> = {
  twilio: "WhatsApp",
  whatsapp: "WhatsApp",
  waha: "WhatsApp (WAHA)",
  telegram: "Telegram",
  instagram: "Instagram",
  messenger: "Messenger",
  manychat: "ManyChat",
  zernio: "Zernio",
  mercadolibre: "MercadoLibre",
};

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return "—";
  return CHANNEL_LABELS[channel] ?? channel;
}

export interface ConfiguredChannel {
  id: string;
  label: string;
  detail: string;
}

/** Channels with credentials configured — shown in Mi Agente even at 0 traffic.
 *  Telegram y Zernio se conectan DESDE el panel (D1 settings), así que se
 *  resuelven igual que en runtime; el resto son secrets de wrangler. */
export async function configuredChannels(env: Env): Promise<ConfiguredChannel[]> {
  const out: ConfiguredChannel[] = [];
  if (env.TWILIO_ACCOUNT_SID) {
    out.push({ id: "twilio", label: "WhatsApp", detail: "Twilio" });
  }
  const telegramToken = await resolveTelegramToken(env);
  if (telegramToken) {
    out.push({ id: "telegram", label: "Telegram", detail: "bot oficial" });
  }
  if (env.INSTAGRAM_ACCESS_TOKEN) {
    out.push({ id: "instagram", label: "Instagram", detail: "Meta oficial" });
  }
  if (env.META_PAGE_ACCESS_TOKEN) {
    out.push({ id: "messenger", label: "Messenger", detail: "Meta oficial" });
  }
  if (env.MANYCHAT_API_KEY) {
    out.push({ id: "manychat", label: "ManyChat", detail: "IG/FB vía ManyChat" });
  }
  const zernio = await resolveZernioCredentials(env);
  if (zernio.apiKey) {
    out.push({ id: "zernio", label: "Zernio", detail: "multicanal unificado" });
  }
  const ml = await loadMlCredentials(env);
  if (mlConnected(ml)) {
    out.push({ id: "mercadolibre", label: "MercadoLibre", detail: "preguntas + post-venta" });
  }
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    out.push({ id: "whatsapp", label: "WhatsApp", detail: "Cloud API oficial" });
  }
  const waha = await resolveWahaConfig(env);
  if (waha.base) {
    out.push({ id: "waha", label: "WhatsApp (WAHA)", detail: "self-hosted" });
  }
  // Nicho taxis: solo WhatsApp (oficial + WAHA) — igual que en Conexiones.
  if (getNiche(env).hooks?.taxiEngine) {
    return out.filter((ch) => ch.id === "whatsapp" || ch.id === "waha");
  }
  return out;
}
