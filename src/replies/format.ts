/**
 * Formato de salida de las respuestas del bot.
 *
 * Los canales de mensajería (WhatsApp, Instagram, Messenger) NO renderizan
 * Markdown: un `[texto](url)` les llega literal y la URL queda sin ser
 * clickeable. Convertimos los links Markdown a texto plano con la URL visible
 * (`texto (https://…)`) para que la app la detecte y la haga clickeable sola.
 * El panel del CRM ya aplica su propio `linkify()` sobre URLs planas.
 */
export function toPlainLinks(text: string): string {
  return text
    // [texto](https://url)  →  texto (https://url)
    .replace(/\[([^\]]+)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g, "$1 ($2)")
    // <https://url>  →  https://url
    .replace(/<(https?:\/\/[^\s>]+)>/g, "$1");
}
