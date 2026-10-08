import type { Env } from "../env";
import { Db } from "../db/client";
import { QuotesRepo } from "../db/quotes";
import { MessagesRepo } from "../db/messages";
import { ConversationsRepo } from "../db/conversations";
import { sendReplyCapped } from "../replies/sender";
import { CHANNEL_CAPABILITIES, type ChannelId } from "../channels/shared";
import { quotePdfUrl, quoteFilename } from "./link";

/**
 * Envía (o reenvía) la cotización al cliente por el canal de su conversación.
 * Adjunta el PDF si el canal lo soporta y hay Browser Rendering; si no, manda
 * el enlace firmado como texto (el endpoint /q lo sirve igual).
 */
export async function sendQuoteToCustomer(
  env: Env,
  quoteId: string,
  opts: { resend?: boolean } = {},
): Promise<{ ok: boolean; dropped: string[]; message?: string }> {
  const db = new Db(env.DB);
  const repo = new QuotesRepo(db);
  const quote = await repo.get(quoteId);
  if (!quote) return { ok: false, dropped: [], message: "cotización no encontrada" };
  if (!quote.channel || !quote.channel_user_id) {
    return { ok: false, dropped: [], message: "la cotización no tiene conversación" };
  }

  const channel = quote.channel as ChannelId;
  const caps = CHANNEL_CAPABILITIES[channel];
  const url = await quotePdfUrl(env, quoteId);
  const attach = Boolean(env.BROWSER) && Boolean(caps?.document);

  const intro = opts.resend
    ? `Te reenvío la cotización ${quote.number} por aquí 👇`
    : `¡Listo! Aquí tienes tu cotización ${quote.number} 👇`;
  const body = attach ? intro : `${intro}\n${url}`;

  const { dropped } = await sendReplyCapped(channel, quote.channel_user_id, [body], env, {
    ...(attach ? { documentUrl: url, documentName: quoteFilename(quote) } : {}),
  });

  if (quote.conversation_id) {
    await new MessagesRepo(db).append(quote.conversation_id, "assistant", body);
    await new ConversationsRepo(db).touchLastMessage(quote.conversation_id);
  }
  await repo.markSent(quoteId);
  return { ok: true, dropped };
}
