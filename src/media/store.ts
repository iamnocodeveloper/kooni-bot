import type { Env } from "../env";
import { Db } from "../db/client";
import { mediaUrl } from "./link";

/**
 * Almacén de recursos multimedia SUBIDOS desde el panel (biblioteca de
 * recursos). Estrategia "auto": si el binding R2 `MEDIA` existe se guarda ahí;
 * si no, los bytes van a D1 (`media_assets`) — así funciona en cualquier
 * instalación viva sin depender de R2.
 *
 * Se sirve por enlace firmado (`GET /media/:token`), porque WAHA/Telegram
 * descargan la URL para reenviar el archivo.
 */

export type MediaKind = "image" | "audio" | "document";

export interface StoredMedia {
  id: string;
  kind: MediaKind;
  mime: string;
  name: string;
  url: string;
}

export interface MediaBytes {
  bytes: Uint8Array;
  mime: string;
  name: string;
}

/** Tope por archivo: generoso con R2, chico sin él (límite de D1 por fila). */
export function maxMediaBytes(env: Env): number {
  return env.MEDIA ? 15 * 1024 * 1024 : 1_800_000;
}

function r2Key(id: string): string {
  return `recursos/${id}`;
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name ?? "");
  return m ? m[1].toLowerCase() : "";
}

export async function putMedia(
  env: Env,
  bytes: Uint8Array,
  opts: { mime: string; name: string; kind: MediaKind },
): Promise<StoredMedia> {
  const id = crypto.randomUUID();
  const name = (opts.name || "").trim() || `${id}${extOf(opts.name) ? `.${extOf(opts.name)}` : ""}`;

  if (env.MEDIA) {
    await env.MEDIA.put(r2Key(id), bytes, {
      httpMetadata: { contentType: opts.mime },
      customMetadata: { kind: opts.kind, name },
    });
  } else {
    await new Db(env.DB).run(
      "INSERT INTO media_assets (id, kind, mime, name, bytes, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, opts.kind, opts.mime, name, bytes, bytes.byteLength, Date.now()],
    );
  }

  return { id, kind: opts.kind, mime: opts.mime, name, url: await mediaUrl(env, id) };
}

export async function getMedia(env: Env, id: string): Promise<MediaBytes | null> {
  if (env.MEDIA) {
    const obj = await env.MEDIA.get(r2Key(id));
    if (!obj) return null;
    const buf = await obj.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      mime: obj.httpMetadata?.contentType ?? "application/octet-stream",
      name: obj.customMetadata?.name ?? id,
    };
  }
  const row = await new Db(env.DB).first<{ mime: string; name: string | null; bytes: ArrayBuffer | Uint8Array }>(
    "SELECT mime, name, bytes FROM media_assets WHERE id = ?",
    [id],
  );
  if (!row) return null;
  const bytes = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
  return { bytes, mime: row.mime, name: row.name ?? id };
}
