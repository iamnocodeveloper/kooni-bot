// member/config.local.ts — config del negocio (la genera `kooni-bot init`).
// NUNCA se sobrescribe en updates. Edita aquí o desde el panel → Configuración.
//
// Este es el valor del TEMPLATE: al instalar, el CLI lo reemplaza con los datos
// reales del negocio. El contexto en vivo vive en D1 (settings.business_context
// y settings.custom_instructions), que mandan sobre esto.

export const memberConfig = {"businessName":"Mi negocio","botName":"Asistente","language":"es","tier":"free","timezone":"America/Mexico_City","currency":"$","contactEmail":""};

export type MemberConfig = typeof memberConfig;

export const businessConfig = {"hours":"","services":[],"location":"","paymentMethods":[],"contactPhone":"","customFields":{}} as {
  hours: string;
  services: { name: string; price: number }[];
  location: string;
  paymentMethods: string[];
  contactPhone: string;
  customFields: Record<string, string>;
};

export const catalog: { name: string; price: number; description?: string; sku?: string }[] = [];
