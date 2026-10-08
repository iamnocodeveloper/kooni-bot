import type { Env } from "../env";
import { Db } from "../db/client";
import { LabelsRepo } from "../db/labels";
import { ConversationLabelsRepo } from "../db/conversationLabels";
import { matchKeywords } from "../utils/keyword-matcher";

/**
 * Motor de etiquetado.
 *
 * - `applyKeywordRules`: determinista y barato — corre en cada mensaje entrante
 *   (src/agent.ts::ingest). Matchea las reglas kind="keyword" contra el texto del
 *   cliente y aplica la etiqueta.
 * - `classifyAndApply`: usa el MODELO DE ANÁLISIS (barato/fast) para decidir qué
 *   etiquetas kind="ai" aplican, a partir del transcript. Corre en el análisis
 *   nocturno (src/insights/analyzer.ts). Fail-open.
 */

export interface ApplyResult {
  applied: string[];
}

/** Aplica las reglas por palabra clave al texto del cliente (tiempo real). */
export async function applyKeywordRules(
  env: Env,
  conversationId: string,
  text: string,
): Promise<ApplyResult> {
  const clean = (text ?? "").trim();
  if (!clean || !conversationId) return { applied: [] };
  const db = new Db(env.DB);
  const rules = await new LabelsRepo(db).enabledRules("keyword").catch(() => []);
  if (rules.length === 0) return { applied: [] };

  const labels = new ConversationLabelsRepo(db);
  const applied: string[] = [];
  for (const rule of rules) {
    const keywords = LabelsRepo.keywordsOf(rule);
    if (keywords.length === 0) continue;
    if (matchKeywords(clean, keywords, true).matched) {
      await labels.add(conversationId, rule.label_id, "rule").catch(() => {});
      applied.push(rule.label_id);
    }
  }
  return { applied };
}

/** Ids de etiqueta válidos según las reglas kind="ai" habilitadas. */
function aiRuleLabels(rules: { label_id: string; ai_instruction: string | null }[]): { label_id: string; ai_instruction: string }[] {
  return rules
    .filter((r) => (r.ai_instruction ?? "").trim().length > 0)
    .map((r) => ({ label_id: r.label_id, ai_instruction: r.ai_instruction as string }));
}

/**
 * Clasifica el transcript con el modelo de análisis y aplica las etiquetas IA
 * que correspondan. Devuelve las etiquetas nuevas aplicadas. Fail-open: nunca
 * lanza (a lo sumo devuelve vacío).
 */
export async function classifyAndApply(
  env: Env,
  conversationId: string,
  transcript: string,
): Promise<ApplyResult> {
  const text = (transcript ?? "").trim();
  if (!text || !conversationId) return { applied: [] };
  try {
    const db = new Db(env.DB);
    const rules = await new LabelsRepo(db).enabledRules("ai");
    const usable = aiRuleLabels(rules);
    if (usable.length === 0) return { applied: [] };

    const { generateText } = await import("ai");
    const { createAnalysisModel } = await import("../llm/provider");
    const { loadAnalysisLlmOverrides } = await import("../settings-loader");
    const { model } = createAnalysisModel(env, await loadAnalysisLlmOverrides(env));

    const list = usable.map((r) => `- "${r.label_id}": ${r.ai_instruction}`).join("\n");
    const prompt = `Eres un clasificador de conversaciones de ${env.BUSINESS_NAME}.
Lee la conversación y decide CUÁLES de las siguientes etiquetas aplican, según su condición.
Reglas de etiquetado (id: condición):
${list}

Responde SOLO con un objeto JSON válido, sin markdown ni explicación:
{"labels": ["id1", "id2"]}
Usa exclusivamente los ids listados arriba, y solo los que cumplan su condición. Si ninguno aplica, devuelve {"labels":[]}.

Conversación:
${text}`;

    const res = await generateText({ model, prompt });
    const ids = parseLabelIds(res.text).filter((id) => usable.some((r) => r.label_id === id));
    if (ids.length === 0) return { applied: [] };

    const labels = new ConversationLabelsRepo(db);
    for (const id of ids) await labels.add(conversationId, id, "ai").catch(() => {});
    return { applied: ids };
  } catch (e) {
    console.warn("[labels] classifyAndApply falló (fail-open):", e);
    return { applied: [] };
  }
}

/** Extrae el array de ids de la salida del modelo (tolera fences y basura). */
export function parseLabelIds(raw: string): string[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const arr = parsed?.labels;
    return Array.isArray(arr) ? arr.map((x: unknown) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}
