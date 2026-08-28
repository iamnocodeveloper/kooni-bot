/**
 * Vigilante con IA (Forja+) — revisa cada conversación y avisa al dueño cuando
 * algo peligra, SIN pasarle el chat (el bot sigue atendiendo).
 *
 * Es heurístico y barato (cero tokens): detecta señales de riesgo en los
 * últimos mensajes del cliente (enojo, queja, venta que se enfría, intención
 * de irse) y, si no avisó recientemente para ESA conversación, manda una
 * alerta por notifyOwner (Telegram/correo/WhatsApp). El historial de avisos
 * vive en dm_logs (kind='vigilante', target=conversación) para throttlear.
 */
import type { Env } from "./env";
import { Db } from "./db/client";
import { MessagesRepo } from "./db/messages";

const THROTTLE_MS = 6 * 60 * 60 * 1000; // una alerta por conversación cada 6h

/** Señales de cliente molesto / queja (match case-insensitive, cualquier posición). */
const ANGRY_RE = /(molest|enoj|enoja|decepcion|queja|quejo|mal servicio|mala atención|no me sirve|terrible|pesim|inútil|estafa|fraude|reembolso|devolución|devolucion|reclamo|insult|no vuelvo|muy caro|carísimo|carisimo|abuso|hdp|mierda|verga|puta|imbécil|imbecil|idiot)/i;

/** Señales de venta que se está enfriando / cliente dudando (riesgo comercial). */
const COOLING_RE = /(lo pienso|lo pienso|lo piens|deja lo pienso|mejor no|ya no quiero|está caro|esta caro|muy caro|se me hace caro|no alcanzo|no me alcanza|lo consulto|lo platico|lo hablo con|mi mamá|mi esposo|mi pareja|a ver|veremos|quizás|quizas|tal vez|después lo veo|despues lo veo|no estoy segur|lo dudo|no me convence|tengo que pensarlo|pensarlo)/i;

/** Señales de cliente a punto de irse (abandono). */
const LEAVING_RE = /(adiós|adios|bye|chau|nos vemos|me voy|gracias por nada|no importa|déjalo|dejalo|mejor me voy|ya me voy)/i;

export interface VigilanteResult {
  signaled: boolean;
  alerted: boolean;
  reason?: string;
  lastMessage?: string;
}

interface SignalRow {
  display_name: string | null;
  channel_user_id: string | null;
}

function lastUserMessage(history: { role: string; content: string }[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].content;
  }
  return "";
}

/**
 * Revisa la última conversación y, si detecta riesgo y no avisó hace poco,
 * notifica al dueño (el bot sigue atendiendo — no es un handoff).
 */
export async function runVigilanteCheck(
  env: Env,
  convId: string,
  displayName?: string | null,
): Promise<VigilanteResult> {
  try {
    const db = new Db(env.DB);
    const msgs = new MessagesRepo(db);

    const history = await msgs.lastN(convId, 8);
    const last = lastUserMessage(history);
    if (!last.trim()) return { signaled: false, alerted: false };

    let reason: string | undefined;
    if (ANGRY_RE.test(last)) {
      reason = "cliente molesto / queja";
    } else if (COOLING_RE.test(last)) {
      reason = "venta en riesgo (cliente dudando)";
    } else if (LEAVING_RE.test(last)) {
      reason = "cliente a punto de irse";
    } else {
      return { signaled: false, alerted: false };
    }

    // Throttle: una alerta por conversación cada 6h (historial en dm_logs).
    const lastAlert = await db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM dm_logs WHERE kind = 'vigilante' AND target = ? AND created_at > ?",
      [convId, Date.now() - THROTTLE_MS],
    );
    if ((lastAlert?.n ?? 0) > 0) {
      return { signaled: true, alerted: false, reason };
    }

    // Registrar el aviso ANTES de notificar (best-effort; si falla, igual se envía).
    try {
      const row = await db.first<SignalRow>(
        "SELECT display_name, channel_user_id FROM conversations WHERE id = ?",
        [convId],
      );
      const nombre = (row?.display_name ?? row?.channel_user_id ?? "Cliente").trim() || "Cliente";
      const { DmLogsRepo } = await import("./db/dmLogs");
      await new DmLogsRepo(db).log({
        ruleId: "vigilante",
        kind: "vigilante",
        platform: "all",
        target: convId,
        username: nombre,
        message: last.slice(0, 300),
        status: "sent",
        error: reason,
      });
    } catch (e) {
      console.warn("[vigilante] no se pudo registrar el aviso:", e);
    }

    const { notifyOwner } = await import("./tools/handoffHuman");
    await notifyOwner(env, {
      reason: "vigilante",
      summary: `👁️ Vigilante: ${reason}. Cliente: ${displayName ?? "conversación"}.\n“${last.slice(0, 180)}”\n\nEl bot sigue atendiendo — si quieres, retoma el chat tú para no perder al cliente.`,
      ticketId: convId,
    });

    console.log(`[vigilante] alerta enviada por ${reason} (${convId})`);
    return { signaled: true, alerted: true, reason, lastMessage: last };
  } catch (e) {
    console.warn("[vigilante] falló (best-effort, no bloquea al bot):", e);
    return { signaled: false, alerted: false };
  }
}
