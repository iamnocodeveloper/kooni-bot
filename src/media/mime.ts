import type { MediaKind } from "./store";

/** MIME por extensión (para lo que subimos desde el panel y lo que enviamos). */
const BY_EXT: Record<string, string> = {
  // imágenes
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  // audio
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4",
  aac: "audio/aac", wav: "audio/wav", amr: "audio/amr",
  // video
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  avi: "video/x-msvideo", "3gp": "video/3gpp",
  // documentos
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv", zip: "application/zip",
};

function extOf(name: string | undefined): string {
  const m = /\.([a-z0-9]{1,8})(?:\?|#|$)/i.exec(name ?? "");
  return m ? m[1].toLowerCase() : "";
}

export function mimeFromName(name: string | undefined, fallback = "application/octet-stream"): string {
  return BY_EXT[extOf(name)] ?? fallback;
}

/** kind del recurso a partir del MIME (image/* | audio/* | video/* | resto = document). */
export function kindFromMime(mime: string): MediaKind {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "document";
}
