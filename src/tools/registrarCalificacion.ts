import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";

/**
 * Encuestas de satisfacción (Kooni+): registra la calificación 1-5 que el
 * cliente dio al cerrar la conversación. Si la nota es baja (1-3), avisa al
 * dueño al instante para que recupere al cliente antes de una mala reseña.
 * El historial de calificaciones vive en dm_logs (kind='calificacion').
 */
export function registrarCalificacionTool(env: Env, getConversationId: () => string | null) {
  return tool({
    description:
      "Registra la calificación de satisfacción (1-5) que el cliente dio al terminar la conversación. USALA cuando el cliente responda con un número del 1 al 5 a la pregunta de cómo lo atendieron. Si la nota es baja, avisa al dueño.",
    inputSchema: z.object({
      calificacion: z.number().int().min(1).max(5).describe("Calificación del cliente: 1 a 5"),
      comentario: z.string().optional().describe("Comentario del cliente (si lo dio)"),
    }),
    execute: async ({ calificacion, comentario }) => {
      const convId = getConversationId();
      const db = new Db(env.DB);
      const ahora = Date.now();

      // Historial en dm_logs (kind calificacion) — alimenta panel y futuro análisis.
      try {
        const { DmLogsRepo } = await import("../db/dmLogs");
        await new DmLogsRepo(db).log({
          ruleId: "encuestas",
          kind: "calificacion",
          platform: "all",
          target: convId ?? undefined,
          message: `${calificacion}/5${comentario ? ` — ${comentario}` : ""}`,
          status: "sent",
          error: calificacion <= 3 ? `Calificación baja (${calificacion}/5)` : undefined,
        });
      } catch (e) {
        console.warn("[encuestas] no se pudo guardar la calificación:", e);
      }

      if (calificacion <= 3) {
        const { notifyOwner } = await import("./handoffHuman");
        await notifyOwner(env, {
          reason: "calificacion",
          summary: `⚠️ Calificación baja (${calificacion}/5) de un cliente${comentario ? `: “${comentario}”` : ""}. Recupéralo antes de que se convierta en mala reseña.`,
          ticketId: convId ?? "satisfaccion",
        });
        return {
          ok: true,
          aviso: "Dueño notificado de la calificación baja.",
        };
      }

      return { ok: true, aviso: "Calificación registrada." };
    },
  });
}
