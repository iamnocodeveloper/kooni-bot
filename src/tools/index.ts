import type { Env } from "../env";
import { isProUnlocked } from "../config";
import { searchKbTool } from "./searchKb";
import { handoffHumanTool } from "./handoffHuman";
import { pauseBotTool } from "./pauseBot";
import { snoozeUserTool } from "./snoozeUser";
import { captureLeadTool } from "./captureLead";
import { scheduleAppointmentTool } from "./scheduleAppointment";
import { catalogQueryTool } from "./catalogQuery";
import { reportQueryTool } from "./reportQuery";
import { enviarRecursoTool, type RecursoCtx } from "./enviarRecurso";
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
  // Free tier base set. captureLead y scheduleAppointment van aquí a propósito: el bot
  // Starter (free) captura prospectos Y agenda citas — Cal.com lo pone el dueño con su
  // propia cuenta/llave, sin costo para Kooni, así que es valor central sin gate. Lo Pro
  // es consultar catálogo/inventario y las tools avanzadas por nicho.
  const tools: Record<string, any> = {
    searchKb: searchKbTool(ctx.env),
    handoffHuman: handoffHumanTool(ctx.env, ctx.getConversationId),
    pauseBot: pauseBotTool(ctx.env, ctx.getConversationId),
    snoozeUser: snoozeUserTool(ctx.env, ctx.getConversationId),
    captureLead: captureLeadTool(ctx.env, ctx.getConversationId),
    // Se registra SIEMPRE: sin ella el modelo alucina reservas. Cuando no hay
    // Cal.com configurado, la tool devuelve guía explícita para capturar el
    // lead en vez de agendar (ver scheduleAppointment.ts).
    scheduleAppointment: scheduleAppointmentTool(ctx.env, ctx.getConversationId),
    // Reporte del día (Forja+): el DUEÑO pregunta en su chat y el bot responde
    // con los números del día (clientes, leads, ventas calientes, molestos).
    reportQuery: reportQueryTool(ctx.env),
  };

  // Pro tier additions
  if (await isProUnlocked(ctx.env)) {
    tools.catalogQuery = catalogQueryTool(ctx.env);
  }

  // Fase A: enviarRecurso — activable desde Configuración (allow_multimedia).
  // El agente llama setRecursoCtx antes del loop con el canal real.
  tools.enviarRecurso = enviarRecursoTool(ctx.env, ctx.getConversationId, getRecursoCtx);

  return tools;
}
