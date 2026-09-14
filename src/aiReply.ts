import type { Env } from "./env";
import { Db } from "./db/client";
import { SettingsRepo, SETTING_KEYS } from "./db/settings";
import { createModel } from "./llm/provider";
import { llmOverridesFrom } from "./settings-loader";
import { detectLanguage, baseLangCode, LANG_LABEL } from "./lang/detect";
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
    // llmOverridesFrom (no un objeto a mano) para que la respuesta pública use
    // TAMBIÉN el `llm_api_base_url`: con un gateway (AIsa/OpenRouter) omitirlo
    // hacía que esta llamada fallara mientras el chat sí funcionaba.
    const ov = llmOverridesFrom(settings);
    const model = createModel(env, "fast", ov); // tier fast: barato y rápido
    const business = opts.businessName || env.BUSINESS_NAME || "el negocio";

    // Idioma del comentario: mismo contrato que el chat — con el extra
    // Multi-idioma APAGADO se responde siempre en el idioma base.
    const multiIdioma = settings[SETTING_KEYS.featureMultiidioma] === "1";
    const baseLang = baseLangCode(env.BOT_LANGUAGE);
    const comentarioLang = multiIdioma ? detectLanguage(opts.commentText) : null;
    const langRule = multiIdioma
      ? comentarioLang
        ? `El comentario está en ${LANG_LABEL[comentarioLang]}: escribí la respuesta en ${LANG_LABEL[comentarioLang]}.`
        : `Si el comentario está en otro idioma, respondé en ESE idioma; si no, en ${LANG_LABEL[baseLang]}.`
      : `Respondé SIEMPRE en ${LANG_LABEL[baseLang]}, aunque el comentario esté en otro idioma.`;

    const instruction = opts.prompt?.trim() || (
      "Responde al comentario de forma breve, cálida y en el tono del negocio. " +
      "Máximo 2 oraciones. No uses emojis excesivos."
    );

    const { text } = await generateText({
      model: model.model,
      system:
        `Eres el asistente del negocio "${business}". ` +
        `Respondes comentarios públicos en redes sociales de forma breve, cálida y natural, ` +
        `en el tono del dueño. Instrucciones del dueño: ${instruction}. ` +
        `${langRule} ` +
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
