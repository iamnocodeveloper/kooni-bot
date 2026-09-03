// Canal MercadoLibre: preguntas en publicaciones + mensajería post-venta.
//
// MercadoLibre NO firma sus webhooks ni manda el contenido: envía un puntero
//   { resource: "/questions/123", topic: "questions", user_id: 456 }
// y hay que ir a buscar el contenido con el token del vendedor. Validamos que
// `user_id` sea el del vendedor conectado antes de procesar nada.
//
// Tópicos que maneja este adapter:
//   • questions → pregunta pública en una publicación. Se responde con
//     POST /answers (una sola vez; queda pública debajo del producto).
//   • messages  → chat post-venta con el comprador (tras la compra). Se
//     responde con POST /messages/packs/{packId}/sellers/{sellerId}.
//
// channelUserId codifica qué responder:
//   "q:<questionId>:<buyerId>"   → POST /answers
//   "m:<packId>:<buyerId>"       → POST /messages/packs/.../sellers/...
import type { ChannelAdapter, IncomingMessage, OutgoingReply } from "./shared";
import type { Env } from "../env";
import { getMlAccessToken } from "./mercadolibreCredentials";

const API_BASE = "https://api.mercadolibre.com";
const MAX_LEN = 2000; // límite práctico de MercadoLibre para respuestas/mensajes

interface MlNotification {
  resource?: string;
  topic?: string;
  user_id?: number | string;
}

interface MlQuestion {
  id?: number | string;
  text?: string;
  status?: string;
  item_id?: string;
  from?: { id?: number | string };
}

interface MlMessage {
  text?: string;
  from?: { user_id?: number | string };
  to?: { user_id?: number | string } | { user_id?: number | string }[];
  message_resources?: { id?: string; name?: string }[];
}

function toId(v: number | string | undefined): string {
  return v === undefined || v === null ? "" : String(v);
}

/** pack id del recurso (/messages/packs/<id>/...) o del mensaje. */
function packIdOf(resource: string, m?: MlMessage): string {
  const fromRes = resource.match(/\/packs\/([^/?]+)/)?.[1];
  if (fromRes) return fromRes;
  const r = (m?.message_resources ?? []).find((x) => (x.name ?? "").toLowerCase() === "packs");
  return r?.id ?? "";
}

/**
 * Convierte una notificación de MercadoLibre en 0..N mensajes entrantes para el
 * agente. Devuelve [] si el canal no está conectado, si la notificación es para
 * otro vendedor, o si el evento no aporta un mensaje del comprador.
 */
export async function parseMercadoLibreEvents(body: unknown, env: Env): Promise<IncomingMessage[]> {
  const n = (body ?? {}) as MlNotification;
  const topic = String(n.topic ?? "");
  const resource = String(n.resource ?? "");
  if (!resource || (topic !== "questions" && topic !== "messages")) return [];

  const auth = await getMlAccessToken(env);
  if (!auth) {
    console.warn("[mercadolibre] webhook recibido pero el canal no está conectado (sin token)");
    return [];
  }
  if (n.user_id != null && toId(n.user_id) !== toId(auth.userId)) {
    console.warn(`[mercadolibre] notificación para otro vendedor (${n.user_id}) — se ignora`);
    return [];
  }

  const headers = { Authorization: `Bearer ${auth.token}` };
  const path = resource.startsWith("/") ? resource : `/${resource}`;

  try {
    if (topic === "questions") {
      const id = path.split("/").filter(Boolean).pop() ?? "";
      if (!id) return [];
      const res = await fetch(`${API_BASE}/questions/${encodeURIComponent(id)}?api_version=4`, {
        headers,
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) {
        console.warn(`[mercadolibre] GET question ${id} → HTTP ${res.status}`);
        return [];
      }
      const q = (await res.json()) as MlQuestion;
      // Solo preguntas SIN responder y de otra persona (no auto-eco).
      if ((q.status ?? "").toUpperCase() !== "UNANSWERED") return [];
      const buyerId = toId(q.from?.id);
      if (!q.text || !buyerId || buyerId === toId(auth.userId)) return [];
      return [
        {
          channel: "mercadolibre",
          channelUserId: `q:${toId(q.id)}:${buyerId}`,
          displayName: `Pregunta · ${q.item_id ?? "publicación"}`,
          text: q.text,
          isOwnerMessage: false,
          receivedAt: Date.now(),
          rawPayload: body,
        },
      ];
    }

    // topic === "messages"
    const res = await fetch(`${API_BASE}${path}`, { headers, signal: AbortSignal.timeout(9000) });
    if (!res.ok) {
      console.warn(`[mercadolibre] GET ${path} → HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { messages?: MlMessage[] } & MlMessage;
    const list: MlMessage[] = Array.isArray(data.messages)
      ? data.messages
      : data.text != null
        ? [data]
        : [];
    const out: IncomingMessage[] = [];
    const sellerId = toId(auth.userId);
    for (const m of list) {
      const text = typeof m.text === "string" ? m.text.trim() : "";
      if (!text) continue;
      const fromId = toId(m.from?.user_id);
      // Ignora los mensajes que envió el propio vendedor (eco de la respuesta).
      if (!fromId || fromId === sellerId) continue;
      const packId = packIdOf(path, m);
      if (!packId) {
        console.warn("[mercadolibre] mensaje sin pack id — no se puede responder, se ignora");
        continue;
      }
      out.push({
        channel: "mercadolibre",
        channelUserId: `m:${packId}:${fromId}`,
        displayName: "Comprador (MercadoLibre)",
        text,
        isOwnerMessage: false,
        receivedAt: Date.now(),
        rawPayload: body,
      });
    }
    return out;
  } catch (e) {
    console.error("[mercadolibre] error leyendo el recurso:", e);
    return [];
  }
}

export const mercadolibreAdapter: ChannelAdapter = {
  // El webhook /webhooks/mercadolibre usa parseMercadoLibreEvents directamente
  // (una notificación puede traer 0..N mensajes). Este método existe por la
  // interfaz ChannelAdapter.
  async parseIncoming(request: Request, env: Env): Promise<IncomingMessage> {
    const body = (await request.json()) as unknown;
    const [first] = await parseMercadoLibreEvents(body, env);
    if (!first) throw new Error("mercadolibre: notificación sin mensaje procesable");
    return first;
  },

  async sendReply(reply: OutgoingReply, env: Env): Promise<void> {
    const auth = await getMlAccessToken(env);
    if (!auth) throw new Error("MercadoLibre no está conectado (sin token válido).");

    // MercadoLibre no admite varios mensajes seguidos como los chats de
    // mensajería: unimos los chunks en una sola respuesta.
    const text = reply.chunks.join("\n\n").trim().slice(0, MAX_LEN);
    if (!text) return;

    const [kind, a, b] = reply.channelUserId.split(":");
    const headers = { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" };

    if (kind === "q") {
      const questionId = Number(a);
      const res = await fetch(`${API_BASE}/answers`, {
        method: "POST",
        headers,
        body: JSON.stringify({ question_id: questionId, text }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`mercadolibre POST /answers ${res.status}: ${detail.slice(0, 200)}`);
      }
      return;
    }

    if (kind === "m") {
      const packId = a;
      const buyerId = b;
      if (!packId || !buyerId) throw new Error("mercadolibre: channelUserId de mensaje incompleto");
      const url = `${API_BASE}/messages/packs/${encodeURIComponent(packId)}/sellers/${encodeURIComponent(
        auth.userId,
      )}?tag=post_sale`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: { user_id: String(auth.userId) },
          to: { user_id: String(buyerId) },
          text,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`mercadolibre POST message ${res.status}: ${detail.slice(0, 200)}`);
      }
      return;
    }

    throw new Error(`mercadolibre: prefijo de channelUserId desconocido (${reply.channelUserId})`);
  },
};
