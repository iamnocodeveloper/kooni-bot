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
