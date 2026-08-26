// member/config.local.ts — config del negocio (generado por scripts/kooni-init.ps1)
// NUNCA se sobrescribe en updates. Edita aquí o desde el panel → Configuración.

export const memberConfig = {"businessName":"negocio demo 1","botName":"Asistente","language":"es","tier":"free","timezone":"America/Mexico_City","contactEmail":""};

export type MemberConfig = typeof memberConfig;

export const businessConfig = {"hours":"todo el dia","services":[{"name":"diseño web y asistencia con IA","price":0}],"location":"ecuador","paymentMethods":["todos"],"contactPhone":"0983859723","customFields":{"ofrecemos":"diseño web y asistencia con IA","preguntasFrecuentes":"nada","tono":"cercano"}} as {
  hours: string;
  services: { name: string; price: number }[];
  location: string;
  paymentMethods: string[];
  contactPhone: string;
  customFields: Record<string, string>;
};

export const catalog: { name: string; price: number; description?: string; sku?: string }[] = [];