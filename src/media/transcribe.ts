import type { Env } from "../env";
import { fetchMediaBytes } from "./fetchRef";

export interface TranscriptionResult {
  text: string;
  durationSeconds?: number;
}

export async function transcribeAudio(
  audioRef: string,
  env: Env,
): Promise<TranscriptionResult> {
  // Descarga con credenciales del canal (WAHA `X-Api-Key`, Telegram token): una
  // URL pública pasa igual, pero un archivo self-hosted ya no falla con 401/403.
  const { bytes } = await fetchMediaBytes(audioRef, env);
  // whisper-large-v3-turbo expects a base64-encoded string in `audio` (per the
  // Cloudflare Workers AI docs), NOT a raw byte array. nodejs_compat is enabled
  // (see wrangler.toml) so Buffer is available, matching the official example.
  const base64 = Buffer.from(bytes).toString("base64");
  const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo" as any, {
    audio: base64,
  } as any);
  return {
    text: (result as any).text ?? "",
  };
}
