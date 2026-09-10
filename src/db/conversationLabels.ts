import { Db } from "./client";

/**
 * Etiquetas de conversación del CRM (`conversation_labels`).
 *
 * Multi-etiqueta por conversación. La etiqueta de sistema principal es
 * `atencion_humana`: se pone sola cuando el bot escala a un humano (tool
 * `handoffHuman` / vigilante) o cuando el dueño la marca a mano, y se quita al
 * resolver el ticket. Se muestra como chip en Conversaciones, badge en el
 * kanban de leads y en la sección de Tickets.
 */
export const NEEDS_HUMAN_LABEL = "atencion_humana";

export interface LabelMeta {
  id: string;
  name: string;
  /** Color CSS (var) del chip/badge. */
  color: string;
  icon: string;
}

export const SYSTEM_LABELS: Record<string, LabelMeta> = {
  [NEEDS_HUMAN_LABEL]: {
    id: NEEDS_HUMAN_LABEL,
    name: "Atención humana",
    color: "var(--bad)",
    icon: "user-round-cog",
  },
};

/** Meta de una etiqueta (cae a una genérica si es desconocida). */
export function labelMeta(label: string): LabelMeta {
  return (
    SYSTEM_LABELS[label] ?? {
      id: label,
      name: label.replace(/_/g, " "),
      color: "var(--muted)",
      icon: "tag",
    }
  );
}

export class ConversationLabelsRepo {
  constructor(private readonly db: Db) {}

  /** Agrega la etiqueta (idempotente). */
  async add(conversationId: string, label: string, createdBy?: string): Promise<void> {
    await this.db.run(
      `INSERT INTO conversation_labels (conversation_id, label, created_at, created_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(conversation_id, label) DO NOTHING`,
      [conversationId, label, Date.now(), createdBy ?? null],
    );
  }

  async remove(conversationId: string, label: string): Promise<void> {
    await this.db.run("DELETE FROM conversation_labels WHERE conversation_id = ? AND label = ?", [
      conversationId,
      label,
    ]);
  }

  async has(conversationId: string, label: string): Promise<boolean> {
    const row = await this.db.first<{ n: number }>(
      "SELECT 1 AS n FROM conversation_labels WHERE conversation_id = ? AND label = ?",
      [conversationId, label],
    );
    return !!row;
  }

  /** Etiquetas de una conversación. */
  async forConversation(conversationId: string): Promise<string[]> {
    const rows = await this.db.all<{ label: string }>(
      "SELECT label FROM conversation_labels WHERE conversation_id = ? ORDER BY label",
      [conversationId],
    );
    return rows.map((r) => r.label);
  }

  /**
   * Etiquetas de varias conversaciones (para el kanban/tickets) en UNA query.
   * Devuelve un mapa conversation_id → labels[].
   */
  async byConversationIds(ids: string[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return out;
    const CHUNK = 90; // límite de parámetros de D1
    for (let i = 0; i < unique.length; i += CHUNK) {
      const slice = unique.slice(i, i + CHUNK);
      const placeholders = slice.map(() => "?").join(",");
      const rows = await this.db.all<{ conversation_id: string; label: string }>(
        `SELECT conversation_id, label FROM conversation_labels
         WHERE conversation_id IN (${placeholders}) ORDER BY label`,
        slice,
      );
      for (const r of rows) {
        (out[r.conversation_id] ??= []).push(r.label);
      }
    }
    return out;
  }

  /** Cuántas conversaciones tienen la etiqueta. */
  async countByLabel(label: string): Promise<number> {
    const row = await this.db.first<{ n: number }>(
      "SELECT COUNT(*) AS n FROM conversation_labels WHERE label = ?",
      [label],
    );
    return row?.n ?? 0;
  }
}
