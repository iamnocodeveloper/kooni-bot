/**
 * Funciones de pago del menú "Extras" (Kooni+) — toggles por feature que el
 * dueño enciende/apaga, y que actúan en el BOT o el PANEL según la función.
 *
 * Cada feature tiene:
 *   - un TOGGLE en el panel (settings "0"|"1") → lo decide el usuario del bot,
 *   - y un MÓDULO de pago (src/modules.ts) → decide si la función está
 *     DISPONIBLE en esa instalación (licencia/override). Con toggle on pero
 *     módulo bloqueado, la función no hace nada y el panel lo muestra 🔒.
 */
import type { Env } from "./env";
import { Db } from "./db/client";
import { SettingsRepo, SETTING_KEYS } from "./db/settings";
import { unlockedModules } from "./modules";

/** Settings de los toggles de las funciones que actúan en el BOT. */
export const FEATURE_KEYS = {
  blindaje: "feature_blindaje_enabled",
  vigilante: "feature_vigilante_enabled",
  handoff: "feature_handoff_enabled",
  cazador: "feature_cazador_enabled",
  oidoVista: "feature_oido_vista_enabled",
  vozMarca: "feature_voz_marca_enabled",
  multiidioma: "feature_multiidioma_enabled",
  encuestas: "feature_encuestas_enabled",
  reenganche: "feature_reenganche_enabled",
  resenas: "feature_resenas_enabled",
  cobros: "feature_cobros_enabled",
  galeria: "feature_galeria_enabled",
  webSync: "feature_web_sync_enabled",
} as const;

export interface ExtraFeature {
  id: string;
  /** Módulo de pago que la desbloquea (src/modules.ts). */
  module: string;
  /** Setting del toggle on/off. */
  toggleKey: string;
  nombre: string;
  emoji: string;
  descripcion: string;
  /** Dónde actúa cuando está encendida. */
  actuaEn: "bot" | "panel" | "bot+panel";
  tipo: "pago_unico" | "membresia";
  /** "reporte" = además del toggle muestra canal + botón de prueba. */
  kind?: "toggle" | "reporte";
  /** Campos de config extra (inputs) que se guardan con el form de Extras. */
  config?: { key: string; label: string; placeholder: string; help: string }[];
}

/** Catálogo del menú Extras (el orden es el del grid). */
export const EXTRA_FEATURES: ExtraFeature[] = [
  {
    id: "reporte",
    module: "nightly_report",
    toggleKey: SETTING_KEYS.nightlyReportEnabled,
    nombre: "Reporte nocturno",
    emoji: "🌙",
    descripcion:
      "Cada noche te llega tu día en un mensaje: clientes atendidos, leads, ventas calientes y clientes molestos. Lo lees en 30 segundos.",
    actuaEn: "panel",
    tipo: "pago_unico",
    kind: "reporte",
  },
  {
    id: "cazador",
    module: "cazador",
    toggleKey: FEATURE_KEYS.cazador,
    nombre: "Cazador de ventas",
    emoji: "🎯",
    descripcion:
      "El bot le escribe solito al cliente que preguntó y se enfrió: un solo mensaje en tu tono, entre 3 y 20 horas después. Recupera ventas que se iban al olvido.",
    actuaEn: "bot",
    tipo: "membresia",
  },
  {
    id: "oido_vista",
    module: "oido_vista",
    toggleKey: FEATURE_KEYS.oidoVista,
    nombre: "Oído y vista",
    emoji: "🎙️",
    descripcion:
      "El bot escucha notas de voz (transcribe) y ve fotos (reconoce productos y comprobantes) y responde al tiro. Cero mensajes que se quedan en visto.",
    actuaEn: "bot",
    tipo: "membresia",
  },
  {
    id: "voz_marca",
    module: "voz_marca",
    toggleKey: FEATURE_KEYS.vozMarca,
    nombre: "Voz de marca",
    emoji: "🗣️",
    descripcion:
      "El bot suena a ti, no a un robot: contesta en el tono del negocio (tú/usted, cercano o formal) en cada mensaje, en cada canal.",
    actuaEn: "bot",
    tipo: "membresia",
  },
  {
    id: "multiidioma",
    module: "multiidioma",
    toggleKey: FEATURE_KEYS.multiidioma,
    nombre: "Multi-idioma",
    emoji: "🌎",
    descripcion:
      "Detecta el idioma del cliente y responde en ese idioma: español, inglés o portugués. Un solo bot, cero clientes perdidos por el idioma.",
    actuaEn: "bot",
    tipo: "membresia",
  },
  {
    id: "encuestas",
    module: "encuestas",
    toggleKey: FEATURE_KEYS.encuestas,
    nombre: "Encuestas de satisfacción",
    emoji: "⭐",
    descripcion:
      "Al cerrar cada conversación pregunta del 1 al 5 cómo le fue. Si la nota es baja, te avisa al instante para que recuperes al cliente.",
    actuaEn: "bot+panel",
    tipo: "membresia",
  },
  {
    id: "blindaje",
    module: "blindaje",
    toggleKey: FEATURE_KEYS.blindaje,
    nombre: "Blindaje anti-inventos",
    emoji: "🛡️",
    descripcion:
      "Tu bot verifica cada respuesta contra tu información real antes de mandarla. Si no está seguro, no adivina: dice “déjame confirmarlo” y te pasa el chat.",
    actuaEn: "bot",
    tipo: "membresia",
  },
  {
    id: "vigilante",
    module: "vigilante",
    toggleKey: FEATURE_KEYS.vigilante,
    nombre: "Vigilante con IA",
    emoji: "👁️",
    descripcion:
      "Cada conversación se revisa sola mientras atiende. Si un cliente se enoja o una venta se está cayendo, te llega el aviso al momento — el bot SIGUE atendiendo.",
    actuaEn: "bot+panel",
    tipo: "membresia",
  },
  {
    id: "handoff",
    module: "handoff_smart",
    toggleKey: FEATURE_KEYS.handoff,
    nombre: "Handoff que sí atina",
    emoji: "🤝",
    descripcion:
      "El bot distingue el momento justo de pasarte el chat: cliente molesto, queja, factura o lead caliente → te lo entrega con todo el contexto. Lo simple lo resuelve solo.",
    actuaEn: "bot",
    tipo: "membresia",
  },
  {
    id: "reenganche",
    module: "reenganche",
    toggleKey: FEATURE_KEYS.reenganche,
    nombre: "Reenganche (recupera no-shows)",
    emoji: "🔄",
    descripcion:
      "Si el Cazador ya escribió y el cliente sigue sin contestar, el bot insiste una vez más, de 2 a 5 días después, en tu tono. Los que dijeron “luego te digo” vuelven a tu agenda.",
    actuaEn: "bot",
    tipo: "membresia",
  },
  {
    id: "resenas",
    module: "resenas",
    toggleKey: FEATURE_KEYS.resenas,
    nombre: "Pide reseñas",
    emoji: "⭐",
    descripcion:
      "Cuando el cliente queda contento, el bot le pide la reseña de Google en ese instante, con tu link. Las estrellas llegan solas y tu negocio sube en el mapa.",
    actuaEn: "bot",
    tipo: "membresia",
    config: [
      {
        key: SETTING_KEYS.reviewLink,
        label: "Link de reseñas de Google",
        placeholder: "https://g.page/tu-negocio/review",
        help: "El bot lo manda cuando pide la reseña. Lo sacas de Google Business.",
      },
    ],
  },
  {
    id: "cobros",
    module: "cobros",
    toggleKey: FEATURE_KEYS.cobros,
    nombre: "Cobros por WhatsApp",
    emoji: "💳",
    descripcion:
      "En cuanto el cliente dice que sí, el bot le manda tu link de pago seguro. Nada de transferencias a ciegas ni capturas. Tú te enteras al instante cuando pagan.",
    actuaEn: "bot",
    tipo: "membresia",
    config: [
      {
        key: SETTING_KEYS.paymentLink,
        label: "Link de pago (Stripe u otro)",
        placeholder: "https://buy.stripe.com/...",
        help: "Crea un Payment Link en Stripe (o tu pasarela) y pégalo. El bot lo envía cuando el cliente acepta.",
      },
    ],
  },
  {
    id: "galeria",
    module: "galeria",
    toggleKey: FEATURE_KEYS.galeria,
    nombre: "Galería",
    emoji: "🖼️",
    descripcion:
      "El bot manda fotos, videos y audios de verdad desde tu biblioteca de recursos: productos, menú, antes/después, notas de voz tuyas — en el momento justo.",
    actuaEn: "bot",
    tipo: "membresia",
  },
  {
    id: "web_sync",
    module: "web_sync",
    toggleKey: FEATURE_KEYS.webSync,
    nombre: "Sincronizar sitio web",
    emoji: "🌐",
    descripcion:
      "El bot lee páginas de tu sitio (catálogo, inventario, precios) y responde con esa info, actualizada sola cada noche. Cada página aparece como documento en Conocimiento.",
    actuaEn: "bot+panel",
    tipo: "membresia",
    config: [
      {
        key: SETTING_KEYS.webSyncUrls,
        label: "Páginas a sincronizar",
        placeholder: "https://tusitio.com/inventario/?limit=100&type=used\nhttps://tusitio.com/inventario/?limit=100&type=new",
        help: "Una URL por línea (máx 10). Se leen cada noche; si algo cambió, el bot lo aprende. Necesita el secret DECODO_AUTH en el worker.",
      },
    ],
  },
];

/** Texto que se inyecta al prompt del agente cuando el Blindaje está encendido. */
export const BLINDAJE_PROMPT_BLOCK = `<blindaje_anti_inventos>
Regla de oro del dueño (BLINDAJE): tu palabra es la del negocio, y una promesa que no puedes cumplir es peor que un "no sé".

- Responde SOLO con datos que puedes respaldar con la información del negocio o la base de conocimiento.
- NUNCA inventes: precios, descuentos, envíos, tallas, disponibilidad, horarios, plazos, costos de tratamientos ni condiciones.
- Si el cliente pregunta algo que NO está en tu información (ej. "¿hacen envíos a otra ciudad?"), NO lo adivines ni lo confirmes. Responde: "Déjame confirmarlo con el equipo y te aviso aquí mismo en un momento" e inmediatamente llama handoffHuman con el contexto, para que el dueño responda con certeza.
- Un "déjame confirmarlo" honesto vale más que un dato inventado. Cuando el dueño responda, retomas y le das el dato real.
</blindaje_anti_inventos>`;

/** Texto que se inyecta al prompt del agente cuando el Handoff inteligente está encendido. */
export const HANDOFF_PROMPT_BLOCK = `<handoff_inteligente>
Reglas del dueño (HANDOFF QUE SÍ ATINA): ni te satures con lo simple, ni te quedes fuera cuando importa.

ESCALA con handoffHuman INMEDIATAMENTE (no lo intentes resolver solo) cuando el cliente:
- está molesto o se queja (queja de cobro, cargo extra, factura, mala atención, demora),
- pide factura / comprobante / hablar con alguien del equipo,
- es un lead CALIENTE: intención real de compra/contratar que necesita confirmación del dueño (precios grandes, condiciones, disponibilidad).
- pide un humano o el dueño.

Entrega SIEMPRE el contexto completo al escalar: quién es, qué quiere y qué pasó.
Lo simple (dudas de horarios, información del negocio, saludos, dudas informativas) lo resuelves TÚ solo, sin molestar al dueño.
Nunca confirmes al cliente un dato que el dueño debe dar (ej. "sí, hay factura") — escala y deja que el dueño lo confirme.
</handoff_inteligente>`;

/** Texto que se inyecta al prompt cuando la Voz de marca está encendida. */
export const VOZ_MARCA_PROMPT_BLOCK = `<voz_de_marca>
Regla del dueño (VOZ DE MARCA): contesta como UNA persona del negocio, no como una plantilla.

- Habla como el dueño: mismo trato (tú/usted), misma energía (cercana, formal o relajada según el tono configurado) y mismo estilo en cada respuesta.
- Nada de "Su solicitud ha sido recibida", "En breve un asesor confirmará", ni frases de call center. Di las cosas como se dicen en una conversación real: "¡Hecho! Te reservé tu hueco de las 5, cualquier cosa aquí estoy 🙌".
- La información puede ser la misma; la FORMA siempre suena a este negocio. Si el cliente nota que le escribe una máquina genérica, pierde confianza.
- Mantén el mismo tono en TODOS los canales (WhatsApp, Instagram, Telegram).
</voz_de_marca>`;

/** Texto que se inyecta al prompt cuando el Multi-idioma está encendido. */
export const MULTIIDIOMA_PROMPT_BLOCK = `<multi_idioma>
EXCEPCIÓN del dueño (MULTI-IDIOMA): tu idioma base es el español, pero el dueño quiere atender a clientes de otros idiomas sin perderlos.

- Detecta el idioma del CLIENTE en su primer mensaje. Si escribe en inglés → respóndele TODO en inglés. Si escribe en portugués → respóndele TODO en portugués. Si escribe en español → español.
- Sigue el idioma del cliente durante TODA la conversación (precios, horarios, confirmaciones incluidas), sin que el cliente tenga que pedirlo.
- El cambio de idioma es automático y natural, sin anunciarlo de más ("te respondo en inglés" una sola vez está bien).
</multi_idioma>`;

/** Texto que se inyecta al prompt cuando las Encuestas de satisfacción están encendidas. */
export const ENCUESTAS_PROMPT_BLOCK = `<encuestas_satisfaccion>
Regla del dueño (ENCUESTAS): al terminar de resolver una conversación (el cliente quedó atendido o el tema se cerró), pregúntale:

"Antes de irme… del 1 al 5, ¿cómo te atendí hoy?"

- Cuando el cliente responda con un número del 1 al 5, llama a la herramienta registrarCalificacion con ese número (y un comentario si lo dio). Si la nota es 1-3, agradece, pide disculpas por lo que salió mal y avísale que ya le avisaste al dueño para que lo contacte.
- No preguntes la encuesta en cada mensaje: solo al CERRAR la conversación, una vez por atención.
</encuestas_satisfaccion>`;

/**
 * Estado del menú Extras con un snapshot de settings (evita re-leer D1).
 * Devuelve, por feature: activada (toggle on) y disponible (módulo pago on).
 */
export async function extrasState(
  env: Env,
  settings?: Record<string, string>,
): Promise<Record<string, { on: boolean; unlocked: boolean }>> {
  const snapshot =
    settings ?? ((await new SettingsRepo(new Db(env.DB)).all().catch(() => ({}))) as Record<string, string>);
  const mods = await unlockedModules(env, snapshot);
  const state: Record<string, { on: boolean; unlocked: boolean }> = {};
  for (const f of EXTRA_FEATURES) {
    state[f.id] = {
      on: snapshot[f.toggleKey] === "1",
      unlocked: mods.has(f.module),
    };
  }
  return state;
}

/** Bloques que dependen de config del dueño (links) — se arman por función. */
function resenasBlock(link: string | undefined): string {
  const url = link?.trim() || "(pídele el link de reseñas al dueño)";
  return `<pide_resenas>
Regla del dueño (PIDE RESEÑAS): convierte clientes contentos en reseñas de Google.

- Cuando el cliente termina agradecido o dice que quedó encantado ("me encantó", "quedó increíble", "excelente, gracias"), es el MOMENTO justo: pídele la reseña con naturalidad, en la misma conversación: "¿Nos regalas 10 segundos y una reseña? Nos ayuda muchísimo a que más personas nos encuentren: ${url}".
- Si el cliente confirma que YA dejó la reseña, avísale al dueño con handoffHuman (reason: reseña) con el nombre y qué dejó.
- NO pidas reseñas a clientes molestos ni a mitad de un problema: solo al buen momento.
</pide_resenas>`;
}

function cobrosBlock(link: string | undefined): string {
  const url = link?.trim() || "(pídele el link de pago al dueño)";
  return `<cobros_whatsapp>
Regla del dueño (COBROS POR WHATSAPP): del sí al pagado sin salir del chat.

- En cuanto el cliente acepta un precio, paquete, anticipo o reserva con pago, mándale el link seguro de pago: ${url} (con el importe y concepto delante, ej. "Perfecto, aquí tu link seguro para pagar:").
- Si el cliente dice que ya pagó, confirma amablemente y avísale al dueño con handoffHuman (reason: pago) con el importe y quién pagó.
- NUNCA pidas transferencia + captura ni des por hecho el pago sin que el cliente confirme.
</cobros_whatsapp>`;
}

/**
 * Bloques de prompt + flags que el agente necesita según el menú Extras.
 * Llamado por resolveAgentConfig (que ya tiene el snapshot de settings).
 */
export async function extrasForAgent(
  env: Env,
  settings: Record<string, string>,
): Promise<{
  extraInstructions: string[];
  vigilanteEnabled: boolean;
  oidoVistaEnabled: boolean;
  galeriaEnabled: boolean;
  multiIdiomaEnabled: boolean;
}> {
  const mods = await unlockedModules(env, settings);
  const on = (key: string, modId: string) => settings[key] === "1" && mods.has(modId);
  const extraInstructions: string[] = [];
  if (on(FEATURE_KEYS.blindaje, "blindaje")) extraInstructions.push(BLINDAJE_PROMPT_BLOCK);
  if (on(FEATURE_KEYS.handoff, "handoff_smart")) extraInstructions.push(HANDOFF_PROMPT_BLOCK);
  if (on(FEATURE_KEYS.vozMarca, "voz_marca")) extraInstructions.push(VOZ_MARCA_PROMPT_BLOCK);
  if (on(FEATURE_KEYS.multiidioma, "multiidioma")) extraInstructions.push(MULTIIDIOMA_PROMPT_BLOCK);
  if (on(FEATURE_KEYS.encuestas, "encuestas")) extraInstructions.push(ENCUESTAS_PROMPT_BLOCK);
  if (on(FEATURE_KEYS.resenas, "resenas")) extraInstructions.push(resenasBlock(settings[SETTING_KEYS.reviewLink]));
  if (on(FEATURE_KEYS.cobros, "cobros")) extraInstructions.push(cobrosBlock(settings[SETTING_KEYS.paymentLink]));
  return {
    extraInstructions,
    vigilanteEnabled: on(FEATURE_KEYS.vigilante, "vigilante"),
    oidoVistaEnabled: on(FEATURE_KEYS.oidoVista, "oido_vista"),
    galeriaEnabled: on(FEATURE_KEYS.galeria, "galeria"),
    multiIdiomaEnabled: on(FEATURE_KEYS.multiidioma, "multiidioma"),
  };
}

/**
 * ¿Una función de Extras está ACTIVA (toggle on Y módulo de pago desbloqueado)?
 * Para gates fuera del prompt (cazador en el cron, oído/vista en el ingest).
 */
export async function isFeatureActive(
  env: Env,
  featureId: string,
  settings?: Record<string, string>,
): Promise<boolean> {
  const f = EXTRA_FEATURES.find((x) => x.id === featureId);
  if (!f) return false;
  const snapshot =
    settings ?? ((await new SettingsRepo(new Db(env.DB)).all().catch(() => ({}))) as Record<string, string>);
  if (snapshot[f.toggleKey] !== "1") return false;
  const mods = await unlockedModules(env, snapshot);
  return mods.has(f.module);
}
