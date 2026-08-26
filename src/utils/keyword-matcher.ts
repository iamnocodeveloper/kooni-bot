/**
 * Keyword Matcher (port de OpenReply)
 *
 * Matchea texto de comentarios/DMs contra keywords con:
 * - Case-insensitive
 * - Whole-word o parcial
 * - OR lógico entre keywords (cualquiera matchea)
 * - Strip de emojis y caracteres especiales
 * - Unicode-aware (letras de cualquier script, acentos) — port exacto del
 *   matcher de OpenReply (lib/utils/keyword-matcher.ts, MIT).
 */

export interface KeywordMatchResult {
  matched: boolean;
  matchedKeyword: string | null;
}

/** Quita emojis y especiales; conserva letras (cualquier script), números y espacios. */
export function stripSpecialCharacters(text: string): string {
  return text
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu,
      "",
    )
    // Conserva letras y números; el resto se vuelve espacio.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chequea si un texto matchea alguna keyword.
 * @param wholeWordMatch true = palabra completa; false = match parcial ("link" en "linking").
 */
export function matchKeywords(
  commentText: string,
  keywords: string[],
  wholeWordMatch: boolean = true,
): KeywordMatchResult {
  if (!commentText || keywords.length === 0) {
    return { matched: false, matchedKeyword: null };
  }

  const cleanedText = stripSpecialCharacters(commentText).toLowerCase();
  if (!cleanedText) return { matched: false, matchedKeyword: null };

  for (const keyword of keywords) {
    const cleanedKeyword = stripSpecialCharacters(keyword).toLowerCase();
    if (!cleanedKeyword) continue;

    if (wholeWordMatch) {
      const escapedKeyword = cleanedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Unicode-aware "palabra completa": la keyword no debe estar flanqueada
      // por otra letra o número (equivalente a \b pero funciona entre
      // caracteres no-Latin).
      const regex = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapedKeyword}(?![\\p{L}\\p{N}])`,
        "iu",
      );
      if (regex.test(cleanedText)) {
        return { matched: true, matchedKeyword: keyword };
      }
    } else {
      if (cleanedText.includes(cleanedKeyword)) {
        return { matched: true, matchedKeyword: keyword };
      }
    }
  }

  return { matched: false, matchedKeyword: null };
}

/** Personaliza {username} en un mensaje (si no hay nombre, usa "there"). */
export function renderUsername(message: string, username?: string | null): string {
  return message.replace(/\{username\}/gi, username?.trim() ? username.trim() : "there");
}
