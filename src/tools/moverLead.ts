import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { LeadsRepo } from "../db/leads";

// El bot mueve el lead de ESTA conversación en el kanban del panel. Lo usa para
// dar continuidad: cuando el cliente responde y avanza (o se enfría), el bot
// actualiza la etapa y deja una nota corta. El dueño ve el cambio en /admin/leads
// y la ficha queda al día para la próxima interacción.
//
// Mapa de etiquetas → estado canónico (el bot razona con las de negocio):
//   entrada → 'entrada'  (sin clasificar)
//   nuevo / clasificado / con interés → 'new'
//   contactado / en conversación / en trámite → 'contacted'
//   ganado / vendido / cliente / resuelto / atendido → 'sold'
//   perdido / descartado / cancelado → 'lost'
const STATUS_MAP: Record<string, "entrada" | "new" | "contacted" | "sold" | "lost"> = {
  entrada: "entrada", "sin clasificar": "entrada",
  nuevo: "new", clasificado: "new", "con interes": "new", "con interés": "new", interesado: "new",
  contactado: "contacted", "en conversacion": "contacted", "en conversación": "contacted", "en tramite": "contacted", "en trámite": "contacted", "en seguimiento": "contacted", confirmada: "contacted",
  ganado: "sold", vendido: "sold", cliente: "sold", resuelto: "sold", resuelta: "sold", atendida: "sold", cerrado: "sold",
  perdido: "lost", perdida: "lost", descartado: "lost", descartada: "lost", cancelada: "lost", frio: "lost", frío: "lost",
};

export function moverLeadTool(env: Env, getConversationId: () => string | null) {
  return tool({
    description:
      "Mueve la ficha de ESTA conversación a otra etapa del panel y deja una nota corta. " +
      "Úsala cuando la situación del contacto cambie: mostró interés real, se comprometió, " +
      "compró/agendó, o se enfrió/no le interesó. NO la uses para clasificar spam ni en cada mensaje.",
    inputSchema: z.object({
      etapa: z
        .string()
        .describe("nueva etapa: 'nuevo' (con interés), 'contactado' (en conversación), 'ganado' (compró/agendó) o 'perdido' (se enfrió / no le interesa)"),
      nota: z.string().max(240).describe("una línea sobre por qué se mueve (queda en la ficha)"),
    }),
    execute: async ({ etapa, nota }) => {
      const convId = getConversationId();
      if (!convId) return { ok: false, motivo: "sin conversación activa" };
      const key = String(etapa).trim().toLowerCase();
      const status = STATUS_MAP[key] ?? (["entrada", "new", "contacted", "sold", "lost"].includes(key) ? (key as any) : null);
      if (!status) return { ok: false, motivo: `etapa no reconocida: "${etapa}"` };

      const leads = new LeadsRepo(new Db(env.DB));
      const lead = await leads.ensureEntrada(convId);
      await leads.setStatus(lead.id, status, `bot: ${nota}`);
      return { ok: true, etapa: status, mensaje: "Ficha actualizada en el panel." };
    },
  });
}
