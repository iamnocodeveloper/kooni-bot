import type { Env } from "../env";
import { searchKbTool } from "./searchKb";
import { handoffHumanTool } from "./handoffHuman";
import { pauseBotTool } from "./pauseBot";
import { snoozeUserTool } from "./snoozeUser";
import { captureLeadTool } from "./captureLead";
import { moverLeadTool } from "./moverLead";
import { scheduleAppointmentTool } from "./scheduleAppointment";
import { catalogQueryTool } from "./catalogQuery";
import { reportQueryTool } from "./reportQuery";
import { registrarCalificacionTool } from "./registrarCalificacion";
import { enviarRecursoTool, type RecursoCtx } from "./enviarRecurso";
import { getNiche } from "../niches";
import type { ChannelId } from "../channels/shared";

// Contexto compartido para tools que necesitan el canal real (enviarRecurso).
let recursoCtx: { channel: ChannelId; channelUserId: string } | null = null;

/** El agente inyecta el canal actual antes del loop (si cambia entre turnos). */
export function setRecursoCtx(channel: ChannelId, channelUserId: string): void {
  recursoCtx = { channel, channelUserId };
}

export function getRecursoCtx(): RecursoCtx | null {
  return recursoCtx;
}

export interface ToolContext {
  env: Env;
  getConversationId: () => string | null;
}

export async function buildTools(ctx: ToolContext) {
  // TODAS las tools están disponibles en todos los planes — free y Pro se
  // diferencian solo por límites de cantidad (src/limits.ts). Cal.com lo pone
  // el dueño con su propia cuenta; catalogQuery necesita catálogo cargado.
  const tools: Record<string, any> = {
    searchKb: searchKbTool(ctx.env),
    handoffHuman: handoffHumanTool(ctx.env, ctx.getConversationId),
    pauseBot: pauseBotTool(ctx.env, ctx.getConversationId),
    snoozeUser: snoozeUserTool(ctx.env, ctx.getConversationId),
    captureLead: captureLeadTool(ctx.env, ctx.getConversationId),
    // Mover la ficha de esta conversación en el kanban del panel (bot ↔ dueño).
    moverLead: moverLeadTool(ctx.env, ctx.getConversationId),
    // Se registra SIEMPRE: sin ella el modelo alucina reservas. Cuando no hay
    // Cal.com configurado, la tool devuelve guía explícita para capturar el
    // lead en vez de agendar (ver scheduleAppointment.ts).
    scheduleAppointment: scheduleAppointmentTool(ctx.env, ctx.getConversationId),
    // Reporte del día (Kooni+): el DUEÑO pregunta en su chat y el bot responde
    // con los números del día (clientes, leads, ventas calientes, molestos).
    reportQuery: reportQueryTool(ctx.env),
    // Encuestas de satisfacción (Kooni+): registra la nota 1-5 y avisa al dueño
    // si es baja. El prompt solo la anuncia cuando el módulo está encendido.
    registrarCalificacion: registrarCalificacionTool(ctx.env, ctx.getConversationId),
  };

  // Consulta de catálogo/inventario — disponible siempre; devuelve vacío con
  // guía si el dueño aún no cargó catálogo.
  tools.catalogQuery = catalogQueryTool(ctx.env);

  // Fase A: enviarRecurso — activable desde Configuración (allow_multimedia).
  // El agente llama setRecursoCtx antes del loop con el canal real.
  tools.enviarRecurso = enviarRecursoTool(ctx.env, ctx.getConversationId, getRecursoCtx);

  // Tools que declara el niche pack activo (packs "pesados", ver NicheHooks).
  // Ej.: BOT_NICHE=restaurante → tomarPedido. Reusa el ctx de canal de enviarRecurso.
  const extraTools = getNiche(ctx.env).hooks?.extraTools ?? [];
  if (extraTools.includes("tomarPedido")) {
    const { tomarPedidoTool } = await import("./tomarPedido");
    tools.tomarPedido = tomarPedidoTool(ctx.env, ctx.getConversationId, getRecursoCtx);
  }

  return tools;
}
