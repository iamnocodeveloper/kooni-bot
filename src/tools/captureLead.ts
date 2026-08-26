import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { LeadsRepo } from "../db/leads";

export function captureLeadTool(env: Env, getConversationId: () => string | null) {
  return tool({
    description:
      "Captura un lead (cliente interesado) para que el dueño venda después. Guarda en D1 + opcionalmente exporta a Google Sheets / Notion / Airtable.",
    inputSchema: z.object({
      name: z.string().optional().describe("Nombre del cliente"),
      contact: z.string().optional().describe("Teléfono o email"),
      intent: z.string().describe("Qué quiere el cliente, en 1-2 frases"),
      notes: z.string().optional(),
      // Campos propios del nicho (giro): viven en lead.metadata (JSON) y el
      // dashboard los muestra como columnas (ver NichePack.columns).
      // Ej. restaurante: { fecha, hora, personas } — inmobiliaria: { presupuesto, zona }.
      metadata: z
        .record(z.string(), z.union([z.string(), z.number(), z.null()]))
        .optional()
        .describe("Campos estructurados del giro (fecha, hora, personas, presupuesto…)"),
    }),
    execute: async ({ name, contact, intent, notes, metadata }) => {
      const convId = getConversationId();
      const leads = new LeadsRepo(new Db(env.DB));
      const leadId = await leads.create({
        conversationId: convId,
        name,
        contact,
        channelUserId: null,
        intent,
        notes,
        metadata,
      });

      // Optional external export — Pro-tier feature, skipped if no creds
      // (Implementation deferred to Task 7.4 — adds Google Sheets export)

      return { leadId, message: "Lead capturado." };
    },
  });
}
