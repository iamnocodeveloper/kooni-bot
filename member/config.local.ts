// member/config.local.ts — config del negocio (generado por scripts/kooni-init.ps1)
// NUNCA se sobrescribe en updates. Edita aquí o desde el panel → Configuración.

export const memberConfig = {"businessName":"negocio demo 1","botName":"Asistente","language":"es","tier":"free","timezone":"America/Mexico_City","contactEmail":""};

export type MemberConfig = typeof memberConfig;

export const businessConfig = {"hours":"Lun a Sáb, 9:00–19:00 (Ecuador). Respuesta por chat 24/7 con el asistente.","services":[{"name":"Asistente de IA multicanal (Kooni) — plan Gratis","price":0},{"name":"Licencia Kooni Fundador (pago único, primeros 20)","price":39},{"name":"Licencia Kooni Pro (mensual)","price":12},{"name":"Diseño web + montaje del asistente","price":0}],"location":"Ecuador — trabajamos 100% en línea","paymentMethods":["transferencia","tarjeta","PayPal"],"contactPhone":"0983859723","customFields":{"ofrecemos":"Asistentes de IA multicanal (WhatsApp, Instagram, Messenger, Telegram) con panel, montados en la nube del cliente. También diseño web. Basado en Kooni (open source, MIT).","whatsapp":"https://wa.me/593983859723","costo_de_operar":"~$5/mes de Cloudflare + ~$1–2/mes de créditos de IA. Sin renta por el bot.","instalacion":"La hace un agente de IA con el comando: npx kooni-bot init. El cliente no toca código.","tono":"cercano, claro, sin tecnicismos"}} as {
  hours: string;
  services: { name: string; price: number }[];
  location: string;
  paymentMethods: string[];
  contactPhone: string;
  customFields: Record<string, string>;
};

export const catalog: { name: string; price: number; description?: string; sku?: string }[] = [];