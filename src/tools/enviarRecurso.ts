import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { sendReplyCapped } from "../replies/sender";
import type { ChannelId, ReplyButton } from "../channels/shared";
import { chunkReply } from "../replies/chunker";

/** Contexto extendido con el canal real (lo pone el agente antes de llamar). */
export interface RecursoCtx {
  channel: ChannelId;
  channelUserId: string;
}

/**
 * Tool: enviarRecurso (Fase A — botones y multimedia)
 *
 * Permite que el bot envíe MATERIAL definido por el dueño (no inventado):
 * una imagen, un audio, o botones, desde la "biblioteca de recursos" que se
 * configura en el panel (Configuración → Biblioteca de recursos).
 *
 * El LLM elige el recurso por nombre; si no existe o el canal no lo soporta,
 * degrada con gracia (el texto se envía igual). Solo se usa si el toggle
 * allow_multimedia está activado.
 */
export function enviarRecursoTool(
  env: Env,
  getConversationId: () => string | null,
  getCtx: () => RecursoCtx | null,
) {
  return tool({
    description:
      "Envía un recurso multimedia (imagen/audio) o botones definidos por el dueño. " +
      "Úsala cuando el cliente pida un catálogo, una promo, el menú, una imagen de referencia, " +
      "un audio de bienvenida, o botones para agendar/ver precios. Los recursos viven en la " +
      "biblioteca del panel (resource_library): elige por su nombre. Si el nombre no existe, " +
      "responde en texto normal sin inventar URLs. El envío es automático.",
    inputSchema: z.object({
      nombre: z.string().describe("Nombre del recurso en la biblioteca (ej. 'catalogo', 'promo', 'menú', 'bienvenida')"),
      caption: z.string().optional().describe("Texto corto que acompaña el recurso (opcional)"),
    }),
    execute: async ({ nombre, caption }) => {
      const convId = getConversationId();
      if (!convId) return { error: "no_conversation" as const };
      const ctx = getCtx();
      if (!ctx) return { error: "sin_canal" as const, mensaje: "No se pudo determinar el canal." };

      try {
        const repo = new SettingsRepo(new Db(env.DB));
        const raw = await repo.get(SETTING_KEYS.resourceLibrary);
        if (!raw) return { error: "sin_biblioteca" as const, mensaje: "El dueño aún no configuró recursos multimedia." };

        let lib: Record<string, { image?: string; audio?: string; caption?: string; buttons?: ReplyButton[] }> = {};
        try {
          lib = JSON.parse(raw);
        } catch {
          return { error: "biblioteca_invalida" as const, mensaje: "La biblioteca de recursos tiene un formato inválido." };
        }

        const key = Object.keys(lib).find((k) => k.toLowerCase() === String(nombre).toLowerCase());
        if (!key) {
          return {
            error: "no_encontrado" as const,
            mensaje: `No encontré el recurso '${nombre}'. Disponibles: ${Object.keys(lib).join(", ") || "ninguno"}.`,
          };
        }
        const res = lib[key];
        const msg = caption ?? res.caption ?? "";

        // Enviar con degradación por canal (sendReplyCapped descarta lo no soportado).
        const { dropped } = await sendReplyCapped(
          ctx.channel,
          ctx.channelUserId,
          chunkReply(msg || "Aquí tienes 👇"),
          env,
          {
            imageUrl: res.image,
            audioUrl: res.audio,
            buttons: res.buttons,
          },
        );

        return {
          ok: true as const,
          nombre: key,
          enviado: true,
          ...(dropped.length ? { descartado: dropped.join(", ") } : {}),
        };
      } catch (e) {
        return { error: "fallo" as const, mensaje: String((e as Error)?.message ?? e) };
      }
    },
  });
}
