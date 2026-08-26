import type { AutoRuleKind } from "../db/autoRules";

/**
 * Plantillas de campaña (port OpenReply Fase 7): presets que rellenan el
 * formulario de automatizaciones con defaults sensatos. El dueño elige una
 * plantilla y ajusta keywords/mensajes a su negocio.
 */
export interface CampaignTemplate {
  id: string;
  label: string;
  desc: string;
  defaults: {
    kind: AutoRuleKind;
    platform: string;
    keywords: string[];
    message: string;
    buttonLabel?: string;
    buttonUrl?: string;
    replyToComment?: string;
    wholeWordMatch?: boolean;
    requireFollow?: boolean;
    followPromptMessage?: string;
    followButtonLabel?: string;
  };
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "link-comentario",
    label: "Link en comentario",
    desc: "Alguien comenta una keyword (ej. 'link', 'info') → recibe tu link por DM. El clásico de OpenReply.",
    defaults: {
      kind: "comment_dm",
      platform: "instagram",
      keywords: ["link", "info", "precio"],
      message: "Hola {username}! Aquí tienes la información que pediste 👇",
      buttonLabel: "Abrir",
      buttonUrl: "https://tusitio.com/recurso",
      replyToComment: "Te escribí por privado ✨",
      wholeWordMatch: true,
      requireFollow: false,
    },
  },
  {
    id: "oferta-follow-gate",
    label: "Oferta + follow gate",
    desc: "Entrega el link solo si te siguen: hace crecer tu cuenta mientras repartes tu oferta.",
    defaults: {
      kind: "comment_dm",
      platform: "instagram",
      keywords: ["oferta", "promo", "descuento"],
      message: "Aquí tienes tu descuento 👇",
      buttonLabel: "Ver oferta",
      buttonUrl: "https://tusitio.com/oferta",
      replyToComment: "Gracias por participar! Revisa tu privado 🎁",
      wholeWordMatch: true,
      requireFollow: true,
      followPromptMessage: "Hola {username}! Sígueme y toca el botón para recibir tu oferta 👇",
      followButtonLabel: "Ya te sigo",
    },
  },
  {
    id: "catalogo-2-links",
    label: "Catálogo (2 links)",
    desc: "Dos botones en el DM: catálogo y WhatsApp para cotizar. Pega los 2 links en el mensaje.",
    defaults: {
      kind: "comment_dm",
      platform: "instagram",
      keywords: ["catálogo", "catalogo", "productos", "comprar"],
      message: "Hola {username}! Te mando el catálogo y mi WhatsApp por si quieres cotizar 👇",
      buttonLabel: "Ver catálogo",
      buttonUrl: "https://tusitio.com/catalogo",
      replyToComment: "Te escribí por privado con el catálogo 📦",
      wholeWordMatch: false,
      requireFollow: false,
    },
  },
  {
    id: "cita-agenda",
    label: "Agendar cita",
    desc: "Alguien comenta 'cita' o 'agendar' → le respondes en público y le pides que te escriba para agendar.",
    defaults: {
      kind: "comment_reply",
      platform: "instagram",
      keywords: ["cita", "agendar", "turno", "reservar"],
      message: "Claro! Escríbeme por privado y te agendo tu cita ✨",
      replyToComment: undefined,
      wholeWordMatch: true,
      requireFollow: false,
    },
  },
  {
    id: "dm-bienvenida",
    label: "Respuesta automática a DM",
    desc: "Cuando alguien te escribe por privado 'hola' o 'info', responde al instante sin esperar a la IA.",
    defaults: {
      kind: "dm_reply",
      platform: "all",
      keywords: ["hola", "info", "precio"],
      message: "Hola {username}! Gracias por escribir. En un momento te atiendo — mientras tanto, dime qué te interesa 🙂",
      wholeWordMatch: true,
      requireFollow: false,
    },
  },
];

export function getTemplate(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id);
}
