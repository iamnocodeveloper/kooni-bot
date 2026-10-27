import type { Env } from "./env";
import { Db } from "./db/client";
import { Conversation, ConversationsRepo } from "./db/conversations";
import { ContactBlocksRepo } from "./db/contactBlocks";

/**
 * Silencio del bot para un contacto/conversación.
 *
 * `blocked` = lista de bloqueados (silencio total, incluye envíos proactivos).
 * `paused`  = pausa temporal o indefinida (`conversations.paused_until`).
 *
 * Un solo helper para que ingest, processBuffer y los envíos proactivos usen
 * exactamente la misma regla.
 */
export interface SilenceState {
  blocked: boolean;
  paused: boolean;
  silent: boolean;
}

export async function isContactBlocked(
  env: Env,
  channel: string,
  channelUserId: string,
): Promise<boolean> {
  try {
    return await new ContactBlocksRepo(new Db(env.DB)).isBlocked(channel, channelUserId);
  } catch (e) {
    // Fail-open: si la tabla aún no se aplicó, el bot no debe quedarse mudo.
    console.warn("[silence] no se pudo consultar contact_blocks:", e);
    return false;
  }
}

export async function getSilenceState(env: Env, conv: Conversation): Promise<SilenceState> {
  const blocked = await isContactBlocked(env, conv.channel, conv.channel_user_id);
  const paused = !!conv.paused_until && conv.paused_until > Date.now();
  return { blocked, paused, silent: blocked || paused };
}

export async function isConversationSilent(env: Env, convId: string): Promise<SilenceState> {
  const conv = await new ConversationsRepo(new Db(env.DB)).getById(convId);
  if (!conv) return { blocked: false, paused: false, silent: false };
  return getSilenceState(env, conv);
}
