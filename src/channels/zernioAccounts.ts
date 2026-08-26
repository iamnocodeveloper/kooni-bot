import type { Env } from "../env";

/** Cuenta social conectada en Zernio (respuesta de GET /v1/accounts). */
export interface ZernioAccount {
  id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  profileUrl?: string;
  isActive?: boolean;
  needsReconnection?: boolean;
  followersCount?: number;
  enabled?: boolean;
}

const DEFAULT_BASE = "https://zernio.com/api";

/**
 * Lista las cuentas sociales conectadas en Zernio (Instagram, TikTok, etc.)
 * usando la API key del secret ZERNIO_API_KEY. Nunca truena: si no hay key o
 * la API falla, devuelve [] (la vista muestra el estado sin cuentas).
 */
export async function listZernioAccounts(env: Env): Promise<ZernioAccount[]> {
  const apiKey = env.ZERNIO_API_KEY;
  if (!apiKey) return [];
  const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
  try {
    const res = await fetch(`${base}/v1/accounts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[zernio] list accounts falló: ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { accounts?: unknown[] };
    const accounts = Array.isArray(json.accounts) ? json.accounts : [];
    return accounts
      .map((a) => a as Record<string, unknown>)
      .filter((a) => a && typeof a === "object")
      .map((a) => ({
        id: String(a._id ?? ""),
        platform: String(a.platform ?? "?"),
        username: a.username ? String(a.username) : undefined,
        displayName: a.displayName ? String(a.displayName) : undefined,
        profilePicture: a.profilePicture ? String(a.profilePicture) : undefined,
        profileUrl: a.profileUrl ? String(a.profileUrl) : undefined,
        isActive: Boolean(a.isActive),
        needsReconnection: Boolean(a.needsReconnection),
        followersCount: typeof a.followersCount === "number" ? a.followersCount : undefined,
        enabled: typeof a.enabled === "boolean" ? a.enabled : true,
      }));
  } catch (e) {
    console.warn("[zernio] list accounts error:", e);
    return [];
  }
}

/** Icono lucide por plataforma (para el panel). */
export function zernioPlatformIcon(platform: string): string {
  switch (platform.toLowerCase()) {
    case "instagram": return "instagram";
    case "tiktok": return "music-2";
    case "facebook": return "facebook";
    case "youtube": return "youtube";
    case "linkedin": return "linkedin";
    case "twitter":
    case "x": return "twitter";
    case "threads": return "at-sign";
    case "pinterest": return "pin";
    case "reddit": return "message-circle";
    case "bluesky": return "cloud";
    case "whatsapp": return "message-circle";
    case "telegram": return "send";
    case "discord": return "gamepad-2";
    default: return "globe";
  }
}

/** Nombre legible de la plataforma. */
export function zernioPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook: "Facebook",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    twitter: "X / Twitter",
    x: "X / Twitter",
    threads: "Threads",
    pinterest: "Pinterest",
    reddit: "Reddit",
    bluesky: "Bluesky",
    googlebusiness: "Google Business",
    telegram: "Telegram",
    snapchat: "Snapchat",
    discord: "Discord",
    slack: "Slack",
    whatsapp: "WhatsApp",
  };
  return labels[platform.toLowerCase()] ?? platform;
}
