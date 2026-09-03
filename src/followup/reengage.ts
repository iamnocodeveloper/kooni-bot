/**
 * Reenganche (Kooni+) — el segundo toque del Cazador de ventas.
 *
 * Si el Cazador ya mandó su follow-up (3-20h) y el cliente SIGUE sin contestar,
 * el Reenganche insiste una vez más, entre 2 y 5 días después de ese primer
 * toque, en el tono del negocio. Un solo mensaje suave — sin acosar.
 *
 * Determinista y conservador:
 *  • La conversación recibió un follow-up (tabla followup_sends) hace entre
 *    2 y 5 días (RE_MIN_MS / RE_MAX_MS).
 *  • El cliente NO respondió después del follow-up (el último mensaje sigue
 *    siendo del asistente).
 *  • Nunca a conversaciones pausadas, nunca por el canal instagram oficial,
 *    y UNA sola vez de por vida (reengagement_sends es el claim).
 *  • Cap por corrida y cap diario (compartido con el Cazador).
 */
import { generateText } from "ai";
import type { Env } from "../env";
import { Db } from "../db/client";
import { MessagesRepo } from "../db/messages";
import { ConversationsRepo } from "../db/conversations";
import { resolveAgentConfig, loadLlmOverrides } from "../settings-loader";
import { createModel } from "../llm/provider";
import { pickAdapter } from "../replies/sender";
import type { ChannelId } from "../channels/shared";

/** Ventana del segundo toque medida desde el primer follow-up. */
export const RE_MIN_MS = 2 * 24 * 60 * 60 * 1000; // 2 días
export const RE_MAX_MS = 5 * 24 * 60 * 60 * 1000; // 5 días

interface CandidateRow {
  id: string;
  channel: string;
  channel_user_id: string;
  display_name: string | null;
  followup_at: number;
}

export async function pickReengagementCandidates(env: Env, now: number, limit: number): Promise<CandidateRow[]> {
  const db = new Db(env.DB);
  return db.all<CandidateRow>(
    `SELECT c.id, c.channel, c.channel_user_id, c.display_name, f.sent_at as followup_at
     FROM conversations c
     JOIN followup_sends f ON f.conversation_id = c.id
     LEFT JOIN reengagement_sends r ON r.conversation_id = c.id
     WHERE r.conversation_id IS NULL
       AND c.channel != 'instagram'
       AND (c.paused_until IS NULL OR c.paused_until < ?)
       AND f.sent_at <= ? AND f.sent_at >= ?
       AND (SELECT role FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) = 'assistant'
     ORDER BY f.sent_at ASC
     LIMIT ?`,
    [now, now - RE_MIN_MS, now - RE_MAX_MS, limit],
  );
}

export interface RunReengagementsResult {
  sent: number;
  skipped: number;
  errors: number;
}

export async function runReengagements(
  env: Env,
  opts: { now?: number; limit?: number; dailyCap?: number } = {},
): Promise<RunReengagementsResult> {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 4;
  const dailyCap = opts.dailyCap ?? 15;
  const db = new Db(env.DB);

  const cfg = await resolveAgentConfig(env, []);
  if (cfg.botPaused) return { sent: 0, skipped: 0, errors: 0 };

  const sentToday =
    (
      await db.first<{ n: number }>(
        "SELECT COUNT(*) as n FROM reengagement_sends WHERE sent_at > ?",
        [now - 24 * 60 * 60 * 1000],
      )
    )?.n ?? 0;
  if (sentToday >= dailyCap) return { sent: 0, skipped: 0, errors: 0 };

  const candidates = await pickReengagementCandidates(env, now, Math.min(limit, dailyCap - sentToday));
  if (candidates.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  const msgs = new MessagesRepo(db);
  const convs = new ConversationsRepo(db);
  const { model, modelId } = createModel(env, "fast", await loadLlmOverrides(env));

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const cand of candidates) {
    const claim = await db.run(
      "INSERT OR IGNORE INTO reengagement_sends (conversation_id, sent_at) VALUES (?, ?)",
      [cand.id, now],
    );
    if ((claim.meta.changes ?? 0) === 0) {
      skipped++;
      continue;
    }

    try {
      const history = await msgs.lastN(cand.id, 6);
      const transcript = history
        .map((m) => `${m.role === "user" ? "Cliente" : "Tú"}: ${m.content.slice(0, 300)}`)
        .join("\n");

      const result = await generateText({
        model,
        prompt: `Eres ${env.BOT_NAME}, respondiendo chats de ${env.BUSINESS_NAME} en primera persona: humano, breve, español casual, sin emojis, nunca pushy.

Este cliente mostró interés, recibió un mensaje tuyo hace unos días y no volvió a contestar. Este es el SEGUNDO y ÚLTIMO toque (no insistir más después de esto). Suave, como quien retoma sin presión:
${cand.display_name ? `Se llama ${cand.display_name}.` : ""}

Últimos mensajes:
${transcript}

Escribe UN solo mensaje MUY breve (máximo 2 líneas): retoma con naturalidad (ej. "solo para avisarte que seguimos con lugar" / "¿te quedó alguna duda?") y cierra sin presionar. NO repitas links que ya le mandaste. Responde SOLO con el mensaje, sin comillas ni explicación.`,
      });

      const text = result.text.trim();
      if (!text) throw new Error("empty reengagement text");

      await msgs.append(cand.id, "assistant", text, { modelUsed: modelId });
      await convs.touchLastMessage(cand.id, now);

      const adapter = pickAdapter(cand.channel as ChannelId);
      await adapter.sendReply(
        {
          channel: cand.channel as ChannelId,
          channelUserId: cand.channel_user_id,
          chunks: [text],
          interChunkDelayMs: 0,
        },
        env,
      );
      sent++;
      console.log(`[reenganche] segundo toque enviado a ${cand.id}`);
    } catch (e) {
      errors++;
      console.error(`[reenganche] failed for ${cand.id}:`, e);
    }
  }

  return { sent, skipped, errors };
}
