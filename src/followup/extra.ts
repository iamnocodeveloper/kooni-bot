/**
 * Tercer toque del seguimiento (Kooni+, modo personalizado).
 *
 * Si el dueño activó "personalizar mensajes de seguimiento" y escribió el
 * mensaje 3, este toque sale 5–10 días después del mensaje 2 (Reenganche), solo
 * si el cliente sigue sin contestar. Es determinista: envía el texto del dueño.
 */
import type { Env } from "../env";
import { Db } from "../db/client";
import { MessagesRepo } from "../db/messages";
import { ConversationsRepo } from "../db/conversations";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { resolveAgentConfig } from "../settings-loader";
import { sendReplyCapped } from "../replies/sender";
import { followupMedia } from "./resource";
import type { ChannelId } from "../channels/shared";

/** Ventana del tercer toque medida desde el segundo (reenganche). */
export const RE3_MIN_MS = 5 * 24 * 60 * 60 * 1000; // 5 días
export const RE3_MAX_MS = 10 * 24 * 60 * 60 * 1000; // 10 días

interface CandidateRow {
  id: string;
  channel: string;
  channel_user_id: string;
  display_name: string | null;
  re_at: number;
}

export async function pickExtraCandidates(env: Env, now: number, limit: number): Promise<CandidateRow[]> {
  const db = new Db(env.DB);
  return db.all<CandidateRow>(
    `SELECT c.id, c.channel, c.channel_user_id, c.display_name, r.sent_at as re_at
     FROM conversations c
     JOIN reengagement_sends r ON r.conversation_id = c.id
     LEFT JOIN followup_touches t ON t.conversation_id = c.id AND t.step = 3
     WHERE t.conversation_id IS NULL
       AND c.channel != 'instagram'
       AND (c.paused_until IS NULL OR c.paused_until < ?)
       AND r.sent_at <= ? AND r.sent_at >= ?
       AND (SELECT role FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) = 'assistant'
     ORDER BY r.sent_at ASC
     LIMIT ?`,
    [now, now - RE3_MIN_MS, now - RE3_MAX_MS, limit],
  );
}

export interface RunExtraResult {
  sent: number;
  skipped: number;
  errors: number;
}

export async function runFollowupExtra(
  env: Env,
  opts: { now?: number; limit?: number; dailyCap?: number } = {},
): Promise<RunExtraResult> {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 4;
  const dailyCap = opts.dailyCap ?? 10;
  const db = new Db(env.DB);

  const cfg = await resolveAgentConfig(env, []);
  if (cfg.botPaused) return { sent: 0, skipped: 0, errors: 0 };

  const settings = new SettingsRepo(db);
  if ((await settings.get(SETTING_KEYS.seguimientoCustom)) !== "1") return { sent: 0, skipped: 0, errors: 0 };
  const text = ((await settings.get(SETTING_KEYS.seguimientoMessage3)) ?? "").trim();
  if (!text) return { sent: 0, skipped: 0, errors: 0 };

  const sentToday =
    (
      await db.first<{ n: number }>(
        "SELECT COUNT(*) as n FROM followup_touches WHERE step = 3 AND sent_at > ?",
        [now - 24 * 60 * 60 * 1000],
      )
    )?.n ?? 0;
  if (sentToday >= dailyCap) return { sent: 0, skipped: 0, errors: 0 };

  const candidates = await pickExtraCandidates(env, now, Math.min(limit, dailyCap - sentToday));
  if (candidates.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  const msgs = new MessagesRepo(db);
  const convs = new ConversationsRepo(db);
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const cand of candidates) {
    const claim = await db.run(
      "INSERT OR IGNORE INTO followup_touches (conversation_id, step, sent_at) VALUES (?, 3, ?)",
      [cand.id, now],
    );
    if ((claim.meta.changes ?? 0) === 0) {
      skipped++;
      continue;
    }
    try {
      await msgs.append(cand.id, "assistant", text);
      await convs.touchLastMessage(cand.id, now);
      const media = await followupMedia(env, SETTING_KEYS.seguimientoResource3, SETTING_KEYS.reengancheResource);
      await sendReplyCapped(cand.channel as ChannelId, cand.channel_user_id, [text], env, {
        ...media,
        interChunkDelayMs: 0,
      });
      sent++;
    } catch (e) {
      errors++;
      console.error(`[seguimiento-3] failed for ${cand.id}:`, e);
    }
  }

  if (sent > 0) console.log(`[seguimiento-3] sent=${sent} skipped=${skipped} errors=${errors}`);
  return { sent, skipped, errors };
}
