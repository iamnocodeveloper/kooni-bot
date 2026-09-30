import type { Env } from "../env";
import { baseLangCode, detectLanguage } from "../lang/detect";
import type { LangCode } from "../lang/detect";

/**
 * Idioma de una conversación para redactar un seguimiento: el que habló el
 * CLIENTE. Los seguimientos no tenían esto y salían SIEMPRE en español aunque
 * la conversación fuera en inglés (prompt hardcodeado). Si el detector no tiene
 * certeza, se cae al idioma base de la instalación (`BOT_LANGUAGE`).
 */
export function conversationLang(
  env: Env,
  msgs: { role: string; content: string }[],
): LangCode {
  const clientText = msgs
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  return detectLanguage(clientText) ?? baseLangCode(env.BOT_LANGUAGE);
}
