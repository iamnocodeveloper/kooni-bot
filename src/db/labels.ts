import { Db } from "./client";

/**
 * Etiquetas definidas por el usuario + reglas que las aplican solas.
 *
 * `labels` es el catálogo (id = slug estable). `label_rules` son las condiciones:
 *  - kind="keyword": match determinista por palabras (JSON array) — se evalúa en
 *    tiempo real en cada mensaje del cliente (ver src/labels/engine.ts).
 *  - kind="ai": el modelo de análisis decide con `ai_instruction` — se evalúa en
 *    el análisis nocturno de conversaciones.
 *
 * La asignación conversación↔etiqueta vive en `conversation_labels` (su columna
 * `label` guarda el id de aquí), ver src/db/conversationLabels.ts.
 */

export type LabelRuleKind = "keyword" | "ai";

export interface LabelRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  description: string | null;
  enabled: number;
  sort_order: number;
  created_at: number;
}

export interface LabelRule {
  id: string;
  label_id: string;
  kind: LabelRuleKind;
  /** JSON array de palabras (kind="keyword"). */
  keywords: string | null;
  /** Instrucción libre para el clasificador (kind="ai"). */
  ai_instruction: string | null;
  enabled: number;
  sort_order: number;
  created_at: number;
}

export interface UpsertLabelInput {
  id?: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  description?: string | null;
  enabled?: boolean;
}

export interface UpsertRuleInput {
  id?: string;
  labelId: string;
  kind: LabelRuleKind;
  keywords?: string[];
  aiInstruction?: string | null;
  enabled?: boolean;
}

/** Convierte un nombre a slug estable y seguro para `conversation_labels.label`. */
export function slugifyLabel(name: string): string {
  const base = (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || `l_${crypto.randomUUID().slice(0, 8)}`;
}

export class LabelsRepo {
  constructor(private readonly db: Db) {}

  async list(includeDisabled = true): Promise<LabelRow[]> {
    const where = includeDisabled ? "" : "WHERE enabled = 1";
    return this.db.all<LabelRow>(
      `SELECT * FROM labels ${where} ORDER BY sort_order ASC, name ASC`,
    );
  }

  async get(id: string): Promise<LabelRow | null> {
    return this.db.first<LabelRow>("SELECT * FROM labels WHERE id = ?", [id]);
  }

  /** Crea o actualiza una etiqueta. Devuelve su id (slug). */
  async upsert(input: UpsertLabelInput): Promise<string> {
    const id = (input.id && input.id.trim()) || slugifyLabel(input.name);
    const now = Date.now();
    const existing = await this.get(id);
    if (existing) {
      await this.db.run(
        "UPDATE labels SET name = ?, color = ?, icon = ?, description = ?, enabled = ? WHERE id = ?",
        [
          input.name,
          input.color ?? existing.color,
          input.icon ?? existing.icon,
          input.description ?? existing.description,
          input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0,
          id,
        ],
      );
      return id;
    }
    const maxRow = await this.db.first<{ n: number }>("SELECT COALESCE(MAX(sort_order), 0) AS n FROM labels");
    await this.db.run(
      `INSERT INTO labels (id, name, color, icon, description, enabled, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.color ?? null,
        input.icon ?? null,
        input.description ?? null,
        input.enabled === false ? 0 : 1,
        (maxRow?.n ?? 0) + 1,
        now,
      ],
    );
    return id;
  }

  async setEnabled(id: string, on: boolean): Promise<void> {
    await this.db.run("UPDATE labels SET enabled = ? WHERE id = ?", [on ? 1 : 0, id]);
  }

  /** Borra la etiqueta, sus reglas y sus asignaciones a conversaciones. */
  async remove(id: string): Promise<void> {
    await this.db.run("DELETE FROM label_rules WHERE label_id = ?", [id]);
    await this.db.run("DELETE FROM conversation_labels WHERE label = ?", [id]);
    await this.db.run("DELETE FROM labels WHERE id = ?", [id]);
  }

  // ── Reglas ────────────────────────────────────────────────────────────────

  async listRules(labelId?: string): Promise<LabelRule[]> {
    if (labelId) {
      return this.db.all<LabelRule>(
        "SELECT * FROM label_rules WHERE label_id = ? ORDER BY sort_order ASC",
        [labelId],
      );
    }
    return this.db.all<LabelRule>("SELECT * FROM label_rules ORDER BY sort_order ASC");
  }

  async upsertRule(input: UpsertRuleInput): Promise<string> {
    const id = input.id?.trim() || crypto.randomUUID();
    const keywords = input.keywords && input.keywords.length ? JSON.stringify(input.keywords) : null;
    const existing = input.id ? await this.db.first<LabelRule>("SELECT * FROM label_rules WHERE id = ?", [input.id]) : null;
    if (existing) {
      await this.db.run(
        "UPDATE label_rules SET kind = ?, keywords = ?, ai_instruction = ?, enabled = ? WHERE id = ?",
        [input.kind, keywords, input.aiInstruction ?? null, input.enabled === false ? 0 : 1, id],
      );
      return id;
    }
    await this.db.run(
      `INSERT INTO label_rules (id, label_id, kind, keywords, ai_instruction, enabled, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, input.labelId, input.kind, keywords, input.aiInstruction ?? null, input.enabled === false ? 0 : 1, Date.now()],
    );
    return id;
  }

  async removeRule(id: string): Promise<void> {
    await this.db.run("DELETE FROM label_rules WHERE id = ?", [id]);
  }

  /** Reglas habilitadas de un tipo (para el motor). */
  async enabledRules(kind?: LabelRuleKind): Promise<LabelRule[]> {
    if (kind) {
      return this.db.all<LabelRule>(
        "SELECT * FROM label_rules WHERE enabled = 1 AND kind = ? ORDER BY sort_order ASC",
        [kind],
      );
    }
    return this.db.all<LabelRule>("SELECT * FROM label_rules WHERE enabled = 1 ORDER BY sort_order ASC");
  }

  /** Parsea el JSON de keywords de una regla (tolerante a valores rotos). */
  static keywordsOf(rule: LabelRule): string[] {
    try {
      const parsed = JSON.parse(rule.keywords ?? "[]");
      return Array.isArray(parsed) ? parsed.map((k) => String(k)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
}
