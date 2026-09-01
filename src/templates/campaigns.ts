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
    desc: "Alguien comenta una keyword (ej. 'link', 'info') → le respondes en público con tu link.",
    defaults: {
      kind: "comment_reply",
      platform: "instagram",
      keywords: ["link", "info", "precio"],
      message: "Hola {username}! Aquí tienes la información que pediste 👇",
      buttonLabel: "Abrir",
      buttonUrl: "https://tusitio.com/recurso",
      wholeWordMatch: true,
      requireFollow: false,
    },
  },
  {
    id: "oferta-comentario",
    label: "Oferta en comentario",
    desc: "Alguien comenta 'oferta' o 'promo' → le respondes en público con el link de tu oferta.",
    defaults: {
      kind: "comment_reply",
      platform: "instagram",
      keywords: ["oferta", "promo", "descuento"],
      message: "Hola {username}! Aquí tienes tu descuento 👇",
      buttonLabel: "Ver oferta",
      buttonUrl: "https://tusitio.com/oferta",
      wholeWordMatch: true,
      requireFollow: false,
    },
  },
  {
    id: "catalogo-2-links",
    label: "Catálogo + WhatsApp",
    desc: "Alguien comenta 'catálogo' → le respondes en público con el link del catálogo (pon tu WhatsApp en el mensaje).",
    defaults: {
      kind: "comment_reply",
      platform: "instagram",
      keywords: ["catálogo", "catalogo", "productos", "comprar"],
      message: "Hola {username}! Aquí está el catálogo. Para cotizar, escríbeme al WhatsApp 👉 wa.me/000",
      buttonLabel: "Ver catálogo",
      buttonUrl: "https://tusitio.com/catalogo",
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
