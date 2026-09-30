/**
 * Referencia que se guarda en el marcador `[IMAGE_URL: ...]`/`[AUDIO_URL: ...]`
 * (§ V Fase 2, previsualización en el panel). Para la mayoría de los canales es
 * la URL tal cual llegó — Telegram ya se enmascara aparte (`maskTelegramToken`).
 * WAHA es el único otro canal cuyo archivo necesita credencial propia para
 * volver a descargarse después (self-hosted, protegido con su API key) — se
 * marca con el prefijo `waha:` para que `src/admin/media.ts` sepa proxyarlo.
 */
export function refFor(channel: string, url: string): string {
  return channel === "waha" ? `waha:${url}` : url;
}

/** Inverso de `refFor`: quita el prefijo `waha:` para volver a tener una URL fetcheable. */
export function stripRef(ref: string): string {
  return ref.startsWith("waha:") ? ref.slice(5) : ref;
}
