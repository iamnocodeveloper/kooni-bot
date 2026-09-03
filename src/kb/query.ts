import type { Env } from "../env";

export interface KbHit {
  title: string;
  content: string;
  score: number;
}

export type KbQueryResult =
  | { results: KbHit[] }
  | { error: "transient"; message: string };

/**
 * Score mínimo para que un fragmento cuente como "match útil".
 *
 * `@cf/baai/bge-m3` sobre fragmentos reales (listados, precios, VIN, URLs) rara
 * vez pasa de ~0.65 aunque el match sea correcto, y baja aún más cuando la
 * consulta y el contenido están en idiomas distintos (cliente pregunta en
 * español, ficha en inglés). Un piso alto (0.70) hacía que el bot descartara
 * resultados buenos y dijera "no tengo esa información" con la KB llena.
 */
export const KB_MIN_SCORE_DEFAULT = 0.45;

/** Override del dueño (`settings.kb_min_score`, 0–1); si no hay, el default. */
export async function resolveKbMinScore(env: Env): Promise<number> {
  try {
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return KB_MIN_SCORE_DEFAULT;
    const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
    const { Db } = await import("../db/client");
    const raw = await new SettingsRepo(new Db(db)).get(SETTING_KEYS.kbMinScore);
    const n = Number.parseFloat(raw ?? "");
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : KB_MIN_SCORE_DEFAULT;
  } catch {
    return KB_MIN_SCORE_DEFAULT;
  }
}

/**
 * Consulta la KB en Vectorize: embebe `query` con el MISMO modelo que la
 * indexación (`@cf/baai/bge-m3`, 1024-dim) y devuelve el top-`k` por score.
 *
 * Una sola implementación para: la tool `searchKb` (la que usa el bot) y el
 * "probar búsqueda" del panel (/admin/kb) — así lo que ve el dueño es
 * EXACTAMENTE lo que ve el bot.
 */
export async function queryKb(env: Env, query: string, k = 5): Promise<KbQueryResult> {
  try {
    const embedding = await env.AI.run("@cf/baai/bge-m3", { text: query });
    const vec = (embedding as { data?: number[][] }).data?.[0];
    if (!Array.isArray(vec)) {
      return { error: "transient", message: "embedding shape unexpected" };
    }
    const matches = await env.KB.query(vec, { topK: k });
    const results: KbHit[] = (matches.matches ?? []).map((m) => ({
      title: (m.metadata?.title as string) ?? "",
      content: (m.metadata?.content as string) ?? "",
      score: m.score ?? 0,
    }));
    return { results };
  } catch (e: unknown) {
    return { error: "transient", message: String((e as Error)?.message ?? e) };
  }
}
