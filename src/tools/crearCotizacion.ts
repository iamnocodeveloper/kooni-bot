import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { QuotesRepo } from "../db/quotes";
import { LeadsRepo } from "../db/leads";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { sendQuoteToCustomer } from "../quotes/send";
import type { ChannelId } from "../channels/shared";

type CtxGetter = () => { channel: ChannelId; channelUserId: string } | null;

/**
 * Crea (o actualiza) el borrador de cotización de la conversación con los ítems
 * que el cliente aceptó, y —si el negocio lo pidió o el auto-envío está
 * encendido— manda el PDF al cliente. El dueño puede editarla/reenviarla desde
 * el panel. Nicho eventos (y cualquier giro que la declare en extraTools).
 */
export function crearCotizacionTool(env: Env, getConversationId: () => string | null, getCtx: CtxGetter) {
  return tool({
    description:
      "Crea el BORRADOR de la cotización de esta conversación con los ítems y datos del evento, y opcionalmente lo envía al cliente. " +
      "Úsala cuando ya tengas qué se cotiza (paquetes/equipos), cantidades y el cliente. " +
      "NO inventes precios: usa los que el cliente aceptó o los del catálogo. No cierres la venta ni cobres.",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            name: z.string().describe("Concepto (ej. 'Photobooth 4 horas')"),
            description: z.string().optional(),
            qty: z.number().positive().describe("Cantidad"),
            unitPrice: z.number().min(0).describe("Precio unitario"),
          }),
        )
        .min(1)
        .describe("Conceptos de la cotización"),
      clientName: z.string().optional(),
      clientContact: z.string().optional(),
      eventType: z.string().optional().describe("Qué se celebra (XV años, boda, empresa…)"),
      eventDate: z.string().optional(),
      eventPlace: z.string().optional(),
      guests: z.number().int().positive().optional(),
      notes: z.string().optional(),
      send: z.boolean().optional().describe("Enviar el PDF al cliente ahora (si el canal lo soporta)"),
    }),
    execute: async (input) => {
      const convId = getConversationId();
      if (!convId) return { ok: false, mensaje: "Sin conversación activa." };
      const ctx = getCtx();
      const db = new Db(env.DB);
      const repo = new QuotesRepo(db);

      const header = {
        conversationId: convId,
        leadId: (await new LeadsRepo(db).ensureEntrada(convId).catch(() => null))?.id ?? null,
        channel: ctx?.channel ?? null,
        channelUserId: ctx?.channelUserId ?? null,
        clientName: input.clientName ?? null,
        clientContact: input.clientContact ?? null,
        eventType: input.eventType ?? null,
        eventDate: input.eventDate ?? null,
        eventPlace: input.eventPlace ?? null,
        guests: input.guests ?? null,
        notes: input.notes ?? null,
        createdBy: "bot",
      };
      const items = input.items.map((it) => ({
        name: it.name,
        description: it.description ?? null,
        qty: it.qty,
        unitPrice: it.unitPrice,
      }));

      const existing = await repo.latestDraft(convId);
      let quoteId: string;
      let number: string | null;
      if (existing) {
        await repo.update(existing.id, header);
        await repo.setItems(existing.id, items);
        quoteId = existing.id;
        number = existing.number;
        await repo.addEvent(existing.id, "updated", "bot");
      } else {
        const created = await repo.create({ ...header, items });
        quoteId = created.id;
        number = created.number;
      }

      const quote = await repo.get(quoteId);
      const total = quote?.total ?? 0;

      // Envío: explícito (send=true) o auto-envío configurado por el dueño.
      let autoSend = false;
      try {
        autoSend = (await new SettingsRepo(db).get(SETTING_KEYS.quoteAutoSend)) === "1";
      } catch { /* sin settings → no auto-envía */ }
      let sent = false;
      if (input.send === true || autoSend) {
        const res = await sendQuoteToCustomer(env, quoteId);
        sent = res.ok;
      }

      return {
        ok: true,
        cotizacionId: quoteId,
        numero: number,
        total,
        enviada: sent,
        instruccion: sent
          ? "Cotización enviada. El dueño puede editarla y reenviarla desde el panel."
          : "Borrador listo. El dueño lo revisa y lo envía desde el panel (o pídele confirmar).",
      };
    },
  });
}
