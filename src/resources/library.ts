import type { ReplyButton } from "../channels/shared";

/**
 * Biblioteca de recursos multimedia (`resource_library`): lo que el bot puede
 * enviar de verdad (imagen/audio/PDF) además del texto. Vive en un setting JSON.
 *
 * Modelo NUEVO (lo que genera el panel Galería):
 *   {"ofertas":{"kind":"image","url":"https://…","name":"ofertas.jpg",
 *     "caption":"Nuestras ofertas 👇","when":"cuando pidan ofertas o promos",
 *     "keywords":["oferta","promo"],"asVoice":true,"buttons":[…]}}
 *
 * Modelo VIEJO (compatibilidad): `{"catalogo":{"image":"https://…","caption":"…"}}`
 * — se normaliza a `{kind:"image", url}`.
 */

export type ResourceKind = "image" | "audio" | "document";

export interface LibraryResource {
  name: string;
  kind: ResourceKind;
  url: string;
  filename?: string;
  caption?: string;
  /** Cuándo usarlo — se inyecta al prompt para que el bot sepa elegir. */
  when?: string;
  keywords?: string[];
  /** Solo audio: enviar como nota de voz (PTT) donde el canal lo soporte. */
  asVoice?: boolean;
  buttons?: ReplyButton[];
}

export type ResourceLibrary = Record<string, LibraryResource>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normalizeButtons(v: unknown): ReplyButton[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ReplyButton[] = [];
  for (const b of v) {
    if (!b || typeof b !== "object") continue;
    const text = asString((b as any).text) ?? asString((b as any).label);
    if (!text) continue;
    const url = asString((b as any).url);
    const callback = asString((b as any).callback);
    out.push({ text, ...(url ? { url } : {}), ...(callback ? { callback } : {}) });
  }
  return out.length ? out : undefined;
}

/** Normaliza UNA entrada (nuevo modelo o legacy) a `LibraryResource`. */
function normalizeEntry(name: string, raw: unknown): LibraryResource | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  let kind = asString(e.kind) as ResourceKind | undefined;
  let url = asString(e.url);
  if (!url || !kind) {
    // Legacy: exactamente una de `image` | `audio` | `document`.
    if (!url && asString(e.image)) { url = asString(e.image); kind = kind ?? "image"; }
    else if (!url && asString(e.audio)) { url = asString(e.audio); kind = kind ?? "audio"; }
    else if (!url && asString(e.document)) { url = asString(e.document); kind = kind ?? "document"; }
  }
  if (!url) return null;
  if (kind !== "image" && kind !== "audio" && kind !== "document") kind = "image";

  const keywords = Array.isArray(e.keywords)
    ? e.keywords.map((k) => String(k).trim()).filter(Boolean)
    : undefined;

  return {
    name,
    kind,
    url,
    ...(asString(e.name) ? { filename: asString(e.name) } : {}),
    ...(asString(e.caption) ? { caption: asString(e.caption) } : {}),
    ...(asString(e.when) ? { when: asString(e.when) } : {}),
    ...(keywords && keywords.length ? { keywords } : {}),
    ...(kind === "audio" ? { asVoice: e.asVoice === false ? false : true } : {}),
    ...(normalizeButtons(e.buttons) ? { buttons: normalizeButtons(e.buttons) } : {}),
  };
}

/** Parsea el JSON de `resource_library` (tolerante a formato viejo/inválido). */
export function parseResourceLibrary(raw: string | null | undefined): ResourceLibrary {
  if (!raw) return {};
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: ResourceLibrary = {};
  for (const [name, entry] of Object.entries(obj as Record<string, unknown>)) {
    const norm = normalizeEntry(name, entry);
    if (norm) out[name] = norm;
  }
  return out;
}

/** Busca un recurso por nombre (case-insensitive). */
export function findResource(lib: ResourceLibrary, name: string): LibraryResource | null {
  const key = Object.keys(lib).find((k) => k.toLowerCase() === String(name).toLowerCase());
  return key ? lib[key] : null;
}

export interface ResourceMediaOpts {
  imageUrl?: string;
  audioUrl?: string;
  documentUrl?: string;
  documentName?: string;
  voice?: boolean;
  buttons?: ReplyButton[];
}

/** Opciones de envío (sendReplyCapped) para un recurso. */
export function resourceMediaOf(res: LibraryResource): ResourceMediaOpts {
  const opts: ResourceMediaOpts = {};
  if (res.kind === "image") opts.imageUrl = res.url;
  else if (res.kind === "audio") {
    opts.audioUrl = res.url;
    if (res.asVoice !== false) opts.voice = true;
  } else {
    opts.documentUrl = res.url;
    opts.documentName = res.filename ?? `${res.name}.pdf`;
  }
  if (res.buttons?.length) opts.buttons = res.buttons;
  return opts;
}

const KIND_LABEL: Record<ResourceKind, string> = {
  image: "imagen",
  audio: "audio",
  document: "documento",
};

/**
 * Bloque de prompt que le dice al bot QUÉ recursos tiene y CUÁNDO usarlos.
 * Se inyecta cuando la Galería está activa. Sin esto, el modelo solo conoce los
 * nombres cuando falla una llamada (comportamiento viejo).
 */
export function resourceCatalogBlock(raw: string | null | undefined): string {
  const lib = parseResourceLibrary(raw);
  const names = Object.keys(lib);
  if (!names.length) return "";
  const lines = names.map((name) => {
    const r = lib[name];
    const kind = r.kind === "audio" && r.asVoice !== false ? "audio / nota de voz" : KIND_LABEL[r.kind];
    const when = r.when ? ` — cuándo: ${r.when}` : "";
    return `- ${name} (${kind})${when}`;
  });
  return (
    `<recursos_multimedia>\n` +
    `Tenés estos recursos listos para enviar. Usalos con la tool enviarRecurso, ` +
    `pasando el nombre EXACTO entre paréntesis:\n` +
    lines.join("\n") +
    `\nEnvialos solo cuando aplique (respetá el "cuándo"); si el cliente pide algo ` +
    `que no está en la lista, respondé en texto sin inventar enlaces.\n` +
    `</recursos_multimedia>`
  );
}
