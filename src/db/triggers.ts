import { Db } from "./client";

/**
 * Disparadores (automatizaciones keyword→flujo, multi-canal). A diferencia de
 * `auto_rules` (específico de comentarios de Zernio), esto corre sobre mensajes
 * entrantes de CUALQUIER canal, desde src/agent.ts::ingest.
 *
 * match_kind: keyword (palabras) | ai (el modelo decide con la instrucción) | any.
 * action: reply_fixed | reply_ai | label | capture_lead | handoff | flow.
 * action_payload: JSON con los parámetros de la acción.
 */

export type TriggerMatchKind = "keyword" | "ai" | "any";
export type TriggerAction = "reply_fixed" | "reply_ai" | "label" | "capture_lead" | "handoff" | "flow";
export const TRIGGER_ACTIONS: readonly TriggerAction[] = [
  "reply_fixed",
  "reply_ai",
  "label",
  "capture_lead",
  "handoff",
  "flow",
];

export interface Trigger {
  id: string;
  name: string;
  enabled: number;
  scope: string; // "any" | channel id
  match_kind: TriggerMatchKind;
  keywords: string | null;
  ai_instruction: string | null;
  action: TriggerAction;
  action_payload: string | null;
  priority: number;
  run_once_per_conversation: number;
  created_at: number;
}

export interface TriggerStep {
  id: string;
  trigger_id: string;
  idx: number;
  delay_minutes: number;
  kind: "text" | "ai";
  content: string | null;
  /** Recurso de la biblioteca adjunto al paso (opcional), por su nombre. */
  media?: { resource: string };
}

export interface TriggerStepInput {
  kind: "text" | "ai";
  content: string;
  delayMinutes: number;
  /** Nombre del recurso (resource_library) a adjuntar al paso. */
  resource?: string;
}

export interface UpsertTriggerInput {
  id?: string;
  name: string;
  enabled?: boolean;
  scope?: string;
  matchKind?: TriggerMatchKind;
  keywords?: string[];
  aiInstruction?: string | null;
  action: TriggerAction;
  actionPayload?: Record<string, unknown>;
  priority?: number;
  runOncePerConversation?: boolean;
}

export class TriggersRepo {
  constructor(private readonly db: Db) {}

  async list(): Promise<Trigger[]> {
    return this.db.all<Trigger>("SELECT * FROM triggers ORDER BY priority DESC, created_at ASC");
  }

  async enabled(): Promise<Trigger[]> {
    return this.db.all<Trigger>("SELECT * FROM triggers WHERE enabled = 1 ORDER BY priority DESC, created_at ASC");
  }

  async get(id: string): Promise<Trigger | null> {
    return this.db.first<Trigger>("SELECT * FROM triggers WHERE id = ?", [id]);
  }

  async upsert(input: UpsertTriggerInput): Promise<string> {
    const id = input.id?.trim() || crypto.randomUUID();
    const keywords = input.keywords && input.keywords.length ? JSON.stringify(input.keywords) : null;
    const payload = input.actionPayload && Object.keys(input.actionPayload).length ? JSON.stringify(input.actionPayload) : null;
    const existing = input.id ? await this.get(id) : null;
    if (existing) {
      await this.db.run(
        `UPDATE triggers SET name = ?, enabled = ?, scope = ?, match_kind = ?, keywords = ?, ai_instruction = ?, action = ?, action_payload = ?, priority = ?, run_once_per_conversation = ? WHERE id = ?`,
        [
          input.name,
          input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0,
          input.scope ?? existing.scope,
          input.matchKind ?? existing.match_kind,
          keywords,
          input.aiInstruction ?? null,
          input.action,
          payload,
          input.priority ?? existing.priority,
          input.runOncePerConversation === undefined ? existing.run_once_per_conversation : input.runOncePerConversation ? 1 : 0,
          id,
        ],
      );
      return id;
    }
    await this.db.run(
      `INSERT INTO triggers (id, name, enabled, scope, match_kind, keywords, ai_instruction, action, action_payload, priority, run_once_per_conversation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.enabled === false ? 0 : 1,
        input.scope ?? "any",
        input.matchKind ?? "keyword",
        keywords,
        input.aiInstruction ?? null,
        input.action,
        payload,
        input.priority ?? 0,
        input.runOncePerConversation ? 1 : 0,
        Date.now(),
      ],
    );
    return id;
  }

  async setEnabled(id: string, on: boolean): Promise<void> {
    await this.db.run("UPDATE triggers SET enabled = ? WHERE id = ?", [on ? 1 : 0, id]);
  }

  async remove(id: string): Promise<void> {
    await this.db.run("DELETE FROM trigger_steps WHERE trigger_id = ?", [id]);
    await this.db.run("DELETE FROM triggers WHERE id = ?", [id]);
  }

  async steps(triggerId: string): Promise<TriggerStep[]> {
    const rows = await this.db.all<TriggerStep & { media_resource: string | null }>(
      `SELECT s.*, m.resource AS media_resource
       FROM trigger_steps s
       LEFT JOIN trigger_step_media m ON m.trigger_id = s.trigger_id AND m.idx = s.idx
       WHERE s.trigger_id = ?
       ORDER BY s.idx ASC`,
      [triggerId],
    );
    return rows.map((r) => {
      const { media_resource, ...step } = r;
      return media_resource ? { ...step, media: { resource: media_resource } } : step;
    });
  }

  async setSteps(triggerId: string, steps: TriggerStepInput[]): Promise<void> {
    await this.db.run("DELETE FROM trigger_steps WHERE trigger_id = ?", [triggerId]);
    await this.db.run("DELETE FROM trigger_step_media WHERE trigger_id = ?", [triggerId]);
    let idx = 0;
    for (const s of steps) {
      await this.db.run(
        "INSERT INTO trigger_steps (id, trigger_id, idx, delay_minutes, kind, content) VALUES (?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), triggerId, idx, s.delayMinutes, s.kind, s.content],
      );
      if (s.resource?.trim()) {
        await this.db.run(
          "INSERT INTO trigger_step_media (trigger_id, idx, resource) VALUES (?, ?, ?)",
          [triggerId, idx, s.resource.trim()],
        );
      }
      idx++;
    }
  }

  static parsePayload(trigger: Pick<Trigger, "action_payload">): Record<string, unknown> {
    try {
      const o = JSON.parse(trigger.action_payload ?? "{}");
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  }

  static keywordsOf(trigger: Pick<Trigger, "keywords">): string[] {
    try {
      const a = JSON.parse(trigger.keywords ?? "[]");
      return Array.isArray(a) ? a.map((x) => String(x)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
}
