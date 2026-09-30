// Constantes de la landing pública (/giros).
//
// CONTACT_EMAIL: es un `mailto:` genérico para el CTA "agendá una demo real de
// 15 min". NO hay número de WhatsApp ni teléfono en ningún lado: la landing es
// pública y no promete un canal que no exista.
// >>> Este es el correo REAL de contacto de la landing: kooni.click <<<
export const CONTACT_EMAIL = "hola@kooni.click";

/** `mailto:` listo para usar, con el asunto ya armado. */
export function mailtoDemo(asunto: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(asunto)}`;
}
