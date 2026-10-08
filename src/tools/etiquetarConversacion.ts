import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { ConversationLabelsRepo } from "../db/conversationLabels";

/**
 * Etiqueta la conversación actual (etiquetado inteligente). El modelo la llama
 * cuando reconoce la condición descrita para una etiqueta que el dueño creó.
 * La lista de etiquetas disponibles se inyecta en la descripción.
 */
export function etiquetarConversacionTool(
  env: Env,
  getConversationId: () => string | null,
  labels: { id: string; name: string }[],
) {
  const list = labels.map((l) => `"${l.id}" (${l.name})`).join(", ");
  return tool({
    description:
      "Pon una etiqueta a ESTA conversación cuando se cumpla la condición que el negocio definió para esa etiqueta. " +
      `Etiquetas disponibles: ${list}. ` +
      "Úsala solo cuando el cliente dejó claro que corresponde (ej. pidió factura, es mayorista, quiere cotización…). " +
      "No etiquetes por suposiciones.",
    inputSchema: z.object({
      etiqueta: z.string().describe("Id de la etiqueta a aplicar (de la lista de disponibles)"),
      motivo: z.string().optional().describe("Por qué aplica la etiqueta (1 frase)"),
    }),
    execute: async ({ etiqueta, motivo }) => {
      const convId = getConversationId();
      if (!convId) return { ok: false, mensaje: "Sin conversación activa." };
      const normalized = (etiqueta ?? "").trim();
      const match =
        labels.find((l) => l.id === normalized) ??
        labels.find((l) => l.name.toLowerCase() === normalized.toLowerCase());
      if (!match) return { ok: false, mensaje: `Etiqueta desconocida: ${etiqueta}` };
      await new ConversationLabelsRepo(new Db(env.DB)).add(convId, match.id, "bot");
      return { ok: true, etiqueta: match.id, motivo: motivo ?? "" };
    },
  });
}
