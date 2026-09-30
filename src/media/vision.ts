import type { ModelMessage } from "ai";

export interface ImageInput {
  bytes: Uint8Array;
  mediaType: string;
}

/**
 * Arma el último mensaje del usuario con la imagen adjunta como bytes. Los bytes
 * (no la URL) permiten adjuntar la credencial del canal en el fetch previo
 * (`src/media/fetchRef.ts`) — el proveedor de IA nunca hace un fetch anónimo
 * que falle en WAHA o exponga el token de Telegram.
 */
export function buildMultimodalUserMessage(
  text: string | undefined,
  image?: ImageInput,
): ModelMessage {
  if (!image) {
    return { role: "user", content: text ?? "" };
  }
  return {
    role: "user",
    content: [
      { type: "image", image: image.bytes, mediaType: image.mediaType },
      ...(text ? [{ type: "text" as const, text }] : []),
    ],
  };
}
