// Constantes de la landing pública (/giros).
//
// CONTACTO_EMAIL: es un `mailto:` genérico para el CTA "agendá una demo real de
// 15 min". NO hay número de WhatsApp ni teléfono en ningún lado: la landing es
// pública y no promete un canal que no exista.
// >>> Cambiá este correo por el real cuando lo tengas. <<<
export const CONTACTO_EMAIL = "hola@kooni.bot";

/** `mailto:` listo para usar, con el asunto ya armado. */
export function mailtoDemo(asunto: string): string {
  return `mailto:${CONTACTO_EMAIL}?subject=${encodeURIComponent(asunto)}`;
}
