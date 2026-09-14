/**
 * Detección de idioma del mensaje del CLIENTE (es / en / pt).
 *
 * Por qué existe: el multi-idioma dependía SOLO del texto del prompt, así que
 * un `system_prompt_override` lo desactivaba por completo y no había ninguna
 * verificación en código. Este detector es determinista y barato (sin API
 * externa, apto para Workers): puntúa stopwords y suma señales diacríticas
 * exclusivas de cada idioma.
 *
 * Ante duda devuelve `null` — nunca adivina. El llamador decide qué hacer con
 * la duda (mantener el idioma detectado antes, o no emitir directiva).
 */
export type LangCode = "es" | "en" | "pt";

export const LANGS: LangCode[] = ["es", "en", "pt"];

/** Nombre en español del idioma, para la directiva de sistema. */
export const LANG_LABEL: Record<LangCode, string> = {
  es: "español",
  en: "inglés",
  pt: "portugués",
};

// Palabras funcionales + términos frecuentes de un concesionario. Se comparan
// sin acentos, así que se escriben normalizadas.
const ES_WORDS = [
  "que", "de", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "y", "o", "u", "para", "por", "con", "sin", "en", "es", "esta", "este", "esto",
  "estos", "estas", "como", "pero", "mas", "muy", "se", "su", "sus", "mi", "mis",
  "tu", "tus", "me", "te", "le", "les", "lo", "los", "al", "del", "si", "no",
  "ya", "hay", "tengo", "tiene", "tienes", "quiero", "quiere", "busco", "busca",
  "buscando", "necesito", "necesita", "puedo", "puede", "podria", "cuesta",
  "cuanto", "cuanta", "cuantos", "cuantas", "precio", "precios", "donde",
  "cuando", "como", "cual", "cuales", "esta", "estan", "soy", "eres", "somos",
  "gracias", "hola", "buenos", "buenas", "dias", "tardes", "noches", "favor",
  "informacion", "disponible", "disponibles", "auto", "autos", "carro", "carros",
  "interesa", "interesado", "quisiera", "gustaria", "ver", "visitar", "cita",
  "manejo", "nuevo", "usado", "milla", "millas", "pago", "mensual", "mensuales",
];

const EN_WORDS = [
  "the", "a", "an", "of", "to", "for", "with", "without", "in", "on", "at",
  "is", "are", "was", "were", "am", "be", "been", "this", "that", "these",
  "those", "how", "what", "when", "where", "which", "who", "why", "do", "does",
  "did", "i", "you", "he", "she", "it", "we", "they", "my", "your", "his",
  "her", "its", "our", "their", "and", "or", "but", "not", "yes", "have", "has",
  "had", "want", "wants", "need", "needs", "looking", "look", "find", "price",
  "prices", "cost", "much", "many", "available", "car", "cars", "vehicle",
  "vehicles", "thanks", "thank", "hello", "hi", "good", "morning", "afternoon",
  "evening", "please", "info", "information", "interested", "would", "can",
  "could", "get", "buy", "test", "drive", "appointment", "miles", "mileage",
  "new", "used", "payment", "monthly",
];

const PT_WORDS = [
  "o", "a", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos",
  "das", "em", "no", "na", "nos", "nas", "por", "para", "com", "sem", "e", "ou",
  "mas", "sao", "esta", "estao", "eu", "voce", "ele", "ela", "nos", "eles",
  "elas", "meu", "minha", "seu", "sua", "quero", "quer", "preciso", "precisa",
  "procuro", "procura", "buscar", "busco", "quanto", "quanta", "quantos",
  "quantas", "custa", "preco", "precos", "onde", "quando", "como", "qual",
  "quais", "tem", "tenho", "temos", "pode", "posso", "poderia", "gostaria",
  "obrigado", "obrigada", "ola", "bom", "boa", "dia", "tarde", "noite", "favor",
  "informacao", "informacoes", "disponivel", "disponiveis", "carro", "carros",
  "veiculo", "veiculos", "interesse", "interessado", "ver", "visitar",
  "novo", "usado", "milhas", "pagamento", "mensal", "mensais",
];

const WORD_SETS: Record<LangCode, Set<string>> = {
  es: new Set(ES_WORDS),
  en: new Set(EN_WORDS),
  pt: new Set(PT_WORDS),
};

/** Evidencia mínima para atreverse a afirmar un idioma. */
const MIN_SCORE = 2;

/**
 * Señales exclusivas de un idioma (valen más que una stopword):
 * - español: ñ, ¿, ¡ (el portugués no las usa)
 * - portugués: ã, õ (el español no las usa) y ç
 */
function diacriticSignals(lower: string): Record<LangCode, number> {
  const es = /[ñ¿¡]/.test(lower) ? 2 : 0;
  const ptAo = /[ãõ]/.test(lower) ? 2 : 0;
  const ptC = /ç/.test(lower) ? 1 : 0;
  return { es, en: 0, pt: ptAo + ptC };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Devuelve el idioma del texto, o `null` si no hay evidencia suficiente o hay
 * empate entre dos idiomas.
 */
export function detectLanguage(text: string | null | undefined): LangCode | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const signals = diacriticSignals(lower);
  const tokens = tokenize(raw);
  if (tokens.length === 0) return null;

  const scores: Record<LangCode, number> = {
    es: signals.es,
    en: signals.en,
    pt: signals.pt,
  };
  for (const token of tokens) {
    for (const lang of LANGS) {
      if (WORD_SETS[lang].has(token)) scores[lang] += 1;
    }
  }

  const ranked = LANGS.map((lang) => ({ lang, score: scores[lang] })).sort(
    (a, b) => b.score - a.score,
  );
  const best = ranked[0];
  const runnerUp = ranked[1];

  if (best.score < MIN_SCORE) return null;
  if (runnerUp && runnerUp.score === best.score) return null;
  return best.lang;
}

/**
 * Código de 2 letras del idioma base configurado (`BOT_LANGUAGE`).
 * Acepta "es-MX" | "en" | "pt-BR" → "es" | "en" | "pt".
 *
 * Importa porque el resto del sistema usa códigos de 2 letras: p. ej. las
 * palabras de frustración están indexadas por `es|en|pt`
 * (src/upgrade/modelSelector.ts).
 */
export function baseLangCode(botLanguage: string | null | undefined): LangCode {
  const l = (botLanguage ?? "").trim().toLowerCase();
  if (l.startsWith("pt")) return "pt";
  if (l.startsWith("en")) return "en";
  return "es";
}
