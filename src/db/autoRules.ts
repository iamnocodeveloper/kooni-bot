import { Db } from "./client";

/** Tipo de regla de automatización. */
export type AutoRuleKind = "comment_dm" | "comment_reply" | "dm_reply";

/**
 * Regla de automatización (flujo) configurada desde el panel /admin/flujos.
 * Se aplica ANTES de la IA: si un comentario o DM matchea una regla activa,
 * la regla gana y el mensaje no entra al agente.
 */
export interface AutoRule {
  id: string;
  kind: AutoRuleKind;
  platform: string; // 'all' | 'instagram' | 'facebook' | ...
  keywords: string[];
  message: string;
  buttonLabel?: string;
  buttonUrl?: string;
  replyToComment?: string;
  /** Prompt para que la IA genere la respuesta pública en el tono del dueño. */
  aiReplyPrompt?: string;
  isActive: boolean;
  /** true = la keyword debe ser palabra completa; false = match parcial. */
  wholeWordMatch: boolean;
  /** Follow gate: requiere que el autor siga la cuenta antes de entregar el link. */
  requireFollow: boolean;
  followPromptMessage?: string;
  followButtonLabel?: string;
  createdAt: number;
  updatedAt: number;
}

interface AutoRuleRow {
  id: string;
  kind: string;
  platform: string;
  keywords: string;
  message: string;
  button_label: string | null;
  button_url: string | null;
  reply_to_comment: string | null;
  ai_reply_prompt: string | null;
  is_active: number;
  whole_word_match: number | null;
  require_follow: number | null;
  follow_prompt_message: string | null;
  follow_button_label: string | null;
  created_at: number;
  updated_at: number;
}

function rowToRule(row: AutoRuleRow): AutoRule {
  let keywords: string[] = [];
  try {
    const parsed = JSON.parse(row.keywords);
    keywords = Array.isArray(parsed) ? parsed.map((k) => String(k)) : [];
  } catch {
    keywords = row.keywords ? [row.keywords] : [];
  }
  return {
    id: row.id,
    kind: row.kind as AutoRuleKind,
    platform: row.platform,
    keywords,
    message: row.message,
    buttonLabel: row.button_label ?? undefined,
    buttonUrl: row.button_url ?? undefined,
    replyToComment: row.reply_to_comment ?? undefined,
    aiReplyPrompt: row.ai_reply_prompt ?? undefined,
    isActive: row.is_active === 1,
    wholeWordMatch: row.whole_word_match !== 0,
    requireFollow: row.require_follow === 1,
    followPromptMessage: row.follow_prompt_message ?? undefined,
    followButtonLabel: row.follow_button_label ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AutoRulesRepo {
  constructor(private readonly db: Db) {}

  async list(opts?: { kind?: AutoRuleKind; platform?: string; onlyActive?: boolean }): Promise<AutoRule[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts?.kind) {
      where.push("kind = ?");
      params.push(opts.kind);
    }
    if (opts?.platform && opts.platform !== "all") {
      where.push("(platform = ? OR platform = 'all')");
      params.push(opts.platform);
    }
    if (opts?.onlyActive) {
      where.push("is_active = 1");
    }
    const sql = `SELECT * FROM auto_rules${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY created_at ASC`;
    const rows = await this.db.all<AutoRuleRow>(sql, params);
    return rows.map(rowToRule);
  }

  async get(id: string): Promise<AutoRule | null> {
    const row = await this.db.first<AutoRuleRow>("SELECT * FROM auto_rules WHERE id = ?", [id]);
    return row ? rowToRule(row) : null;
  }

  async create(input: {
    kind: AutoRuleKind;
    platform?: string;
    keywords: string[];
    message: string;
    buttonLabel?: string;
    buttonUrl?: string;
    replyToComment?: string;
    aiReplyPrompt?: string;
    wholeWordMatch?: boolean;
    requireFollow?: boolean;
    followPromptMessage?: string;
    followButtonLabel?: string;
  }): Promise<AutoRule> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db.run(
      `INSERT INTO auto_rules (id, kind, platform, keywords, message, button_label, button_url, reply_to_comment, ai_reply_prompt, is_active, whole_word_match, require_follow, follow_prompt_message, follow_button_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.kind,
        input.platform ?? "all",
        JSON.stringify((input.keywords ?? []).map((k) => k.trim()).filter(Boolean)),
        input.message.trim(),
        input.buttonLabel?.trim() ?? null,
        input.buttonUrl?.trim() ?? null,
        input.replyToComment?.trim() ?? null,
        input.aiReplyPrompt?.trim() ?? null,
        input.wholeWordMatch === false ? 0 : 1,
        input.requireFollow ? 1 : 0,
        input.followPromptMessage?.trim() ?? null,
        input.followButtonLabel?.trim() ?? null,
        now,
        now,
      ],
    );
    const rule = await this.get(id);
    if (!rule) throw new Error("auto rule create failed");
    return rule;
  }

  async update(
    id: string,
    input: Partial<{
      kind: AutoRuleKind;
      platform: string;
      keywords: string[];
      message: string;
      buttonLabel?: string;
      buttonUrl?: string;
      replyToComment?: string;
      aiReplyPrompt?: string;
      isActive: boolean;
      wholeWordMatch: boolean;
      requireFollow: boolean;
      followPromptMessage?: string;
      followButtonLabel?: string;
    }>,
  ): Promise<AutoRule | null> {
    const current = await this.get(id);
    if (!current) return null;
    const next: AutoRule = {
      ...current,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.platform ? { platform: input.platform } : {}),
      ...(input.keywords ? { keywords: input.keywords } : {}),
      ...(input.message !== undefined ? { message: input.message.trim() } : {}),
      ...(input.buttonLabel !== undefined ? { buttonLabel: input.buttonLabel?.trim() || undefined } : {}),
      ...(input.buttonUrl !== undefined ? { buttonUrl: input.buttonUrl?.trim() || undefined } : {}),
      ...(input.replyToComment !== undefined ? { replyToComment: input.replyToComment?.trim() || undefined } : {}),
      ...(input.aiReplyPrompt !== undefined ? { aiReplyPrompt: input.aiReplyPrompt?.trim() || undefined } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.wholeWordMatch !== undefined ? { wholeWordMatch: input.wholeWordMatch } : {}),
      ...(input.requireFollow !== undefined ? { requireFollow: input.requireFollow } : {}),
      ...(input.followPromptMessage !== undefined ? { followPromptMessage: input.followPromptMessage?.trim() || undefined } : {}),
      ...(input.followButtonLabel !== undefined ? { followButtonLabel: input.followButtonLabel?.trim() || undefined } : {}),
    };
    await this.db.run(
      `UPDATE auto_rules SET kind = ?, platform = ?, keywords = ?, message = ?, button_label = ?, button_url = ?, reply_to_comment = ?, ai_reply_prompt = ?, is_active = ?, whole_word_match = ?, require_follow = ?, follow_prompt_message = ?, follow_button_label = ?, updated_at = ? WHERE id = ?`,
      [
        next.kind,
        next.platform,
        JSON.stringify(next.keywords),
        next.message,
        next.buttonLabel ?? null,
        next.buttonUrl ?? null,
        next.replyToComment ?? null,
        next.aiReplyPrompt ?? null,
        next.isActive ? 1 : 0,
        next.wholeWordMatch ? 1 : 0,
        next.requireFollow ? 1 : 0,
        next.followPromptMessage ?? null,
        next.followButtonLabel ?? null,
        Date.now(),
        id,
      ],
    );
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.db.run("DELETE FROM auto_rules WHERE id = ?", [id]);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.db.run("UPDATE auto_rules SET is_active = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, Date.now(), id]);
  }
}
