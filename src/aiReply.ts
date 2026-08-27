import type { Env } from "./env";
import { Db } from "./db/client";
import { SettingsRepo, SETTING_KEYS } from "./db/settings";
import { createModel } from "./llm/provider";
import { generateText } from "ai";

/**
 * Genera respuestas públicas a comentarios con IA, en el tono del dueño.
 *
 * Reusa el MISMO proveedor/llave/modelo configurado en el panel (BYO-LLM):
 * Anthropic / OpenAI / xAI, con las overrides de settings si existen.
 * El prompt de la regla (aiReplyPrompt) define el tono/instrucciones; si está
 * vacío, se usa un default en el tono del negocio.
 *
 * Fail-open: si la IA falla o no hay llave, devuelve null (el flujo usa el
 * replyToComment fijo o se salta la respuesta pública).
 */
export async function generateAiPublicReply(
  env: Env,
  opts: {
    prompt?: string;
    commentText?: string;
    commenterName?: string | null;
    businessName?: string;
    keyword?: string;
  },
): Promise<string | null> {
  try {
    const repo = new SettingsRepo(new Db(env.DB));
    const settings = (await repo.all().catch(() => ({}))) as Record<string, string>;
    const ov = {
      provider: settings[SETTING_KEYS.llmProvider] || undefined,
      apiKey: settings[SETTING_KEYS.llmApiKey] || undefined,
      model: settings[SETTING_KEYS.llmModel] || undefined,
    };
    const model = createModel(env, "fast", ov); // tier fast: barato y rápido
    const business = opts.businessName || env.BUSINESS_NAME || "el negocio";

    const instruction = opts.prompt?.trim() || (
      "Responde al comentario de forma breve, cálida y en el tono del negocio. " +
      "Máximo 2 oraciones. Usa español sencillo. No uses emojis excesivos."
    );

    const { text } = await generateText({
      model: model.model,
      system:
        `Eres el asistente del negocio "${business}". ` +
        `Respondes comentarios públicos en redes sociales de forma breve, cálida y natural, ` +
        `en el tono del dueño. Instrucciones del dueño: ${instruction}. ` +
        `Nunca inventes precios ni datos que no conozcas. Si el comentario pide algo que no sabes, ` +
        `invítalo a escribir por privado.`,
      prompt:
        `El cliente ${opts.commenterName || "alguien"} comentó${opts.keyword ? ` (mencionó: ${opts.keyword})` : ""}: ` +
        `"${opts.commentText || "..."}"\n\n` +
        `Escribe SOLO la respuesta pública (sin comillas, sin prefijos).`,
      maxOutputTokens: 80,
    });

    const reply = (text ?? "").trim();
    return reply.length > 0 ? reply.slice(0, 300) : null;
  } catch (e) {
    console.warn("[aiReply] generación falló — fallback a replyToComment:", e);
    return null;
  }
}
