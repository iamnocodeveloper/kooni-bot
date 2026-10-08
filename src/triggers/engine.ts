import type { Env } from "../env";
import { Db } from "../db/client";
import { TriggersRepo, type Trigger } from "../db/triggers";
import { ConversationLabelsRepo } from "../db/conversationLabels";
import { LeadsRepo } from "../db/leads";
import { MessagesRepo } from "../db/messages";
import { sendReplyCapped } from "../replies/sender";
import { matchKeywords } from "../utils/keyword-matcher";
import type { ChannelId } from "../channels/shared";

/**
 * Motor de disparadores (automatizaciones keyword→flujo, multi-canal). Corre en
 * cada mensaje entrante (src/agent.ts::ingest). Devuelve si algún disparador
 * respondió YA — en ese caso el mensaje NO entra al buffer del agente.
 */

export interface TriggerEvalContext {
  conversationId: string;
  channel: ChannelId;
  channelUserId: string;
  text: string;
  /**
   * Programa pasos de un `flow` con demora (minutos). Lo aporta el Durable
   * Object (usa el scheduler del agente); en tests puede ser un espía.
   */
  scheduleFlow?: (steps: { delayMinutes: number; text: string }[]) => void;
}

export interface TriggerOutcome {
  matched: string[];
  replied: boolean;
}

/** ¿El texto matchea el disparador? keyword = determinista; ai = modelo; any = siempre. */
async function matches(env: Env, trigger: Trigger, text: string): Promise<boolean> {
  if (trigger.match_kind === "any") return true;
  if (trigger.match_kind === "keyword") {
    const kws = TriggersRepo.keywordsOf(trigger);
    return kws.length > 0 && matchKeywords(text, kws, true).matched;
  }
  // kind === "ai"
  const instruction = (trigger.ai_instruction ?? "").trim();
  if (!instruction) return false;
  try {
    const { generateText } = await import("ai");
    const { createAnalysisModel } = await import("../llm/provider");
    const { loadAnalysisLlmOverrides } = await import("../settings-loader");
    const { model } = createAnalysisModel(env, await loadAnalysisLlmOverrides(env));
    const res = await generateText({
      model,
      prompt: `Condición: ${instruction}\n\nMensaje del cliente: "${text}"\n\n¿El mensaje cumple la condición? Responde SOLO {"match": true} o {"match": false}.`,
    });
    const start = res.text.indexOf("{");
    const end = res.text.lastIndexOf("}");
    if (start === -1 || end <= start) return false;
    return JSON.parse(res.text.slice(start, end + 1))?.match === true;
  } catch (e) {
    console.warn("[triggers] match IA falló (fail-open):", e);
    return false;
  }
}

/** ¿Ya se disparó esta regla en esta conversación? (dedup run_once). */
async function alreadyHit(db: Db, triggerId: string, conversationId: string): Promise<boolean> {
  const row = await db.first<{ n: number }>(
    "SELECT COUNT(*) AS n FROM keyword_hits WHERE keyword = ? AND conversation_id = ? AND phase = 'trigger'",
    [triggerId, conversationId],
  );
  return (row?.n ?? 0) > 0;
}

async function markHit(db: Db, triggerId: string, conversationId: string): Promise<void> {
  await db.run(
    "INSERT INTO keyword_hits (keyword, conversation_id, phase, created_at) VALUES (?, ?, 'trigger', ?)",
    [triggerId, conversationId, Date.now()],
  );
}

/** Genera una respuesta con IA para la acción reply_ai / paso de flujo "ai". */
async function aiText(env: Env, instruction: string, inbound: string): Promise<string | null> {
  try {
    const { generateText } = await import("ai");
    const { createModel } = await import("../llm/provider");
    const { loadLlmOverrides } = await import("../settings-loader");
    const { model } = createModel(env, "fast", await loadLlmOverrides(env));
    const res = await generateText({
      model,
      prompt:
        `${instruction}\n\nEscribe SOLO el mensaje para el cliente, en su idioma, breve y natural. ` +
        `No expliques nada más.\n\nMensaje del cliente: "${inbound}"`,
    });
    const t = res.text.trim();
    return t || null;
  } catch (e) {
    console.warn("[triggers] reply_ai falló:", e);
    return null;
  }
}

async function sendAndRecord(env: Env, ctx: TriggerEvalContext, db: Db, text: string): Promise<void> {
  await sendReplyCapped(ctx.channel, ctx.channelUserId, [text], env);
  await new MessagesRepo(db).append(ctx.conversationId, "assistant", text);
}

/**
 * Evalúa los disparadores habilitados y aplica la acción del primero que
 * matchee por tipo de respuesta. Etiquetar/capturar/handoff pueden acumularse;
 * una respuesta (fixed/ai/flow) corta el resto de respuestas.
 */
export async function evaluateTriggers(env: Env, ctx: TriggerEvalContext): Promise<TriggerOutcome> {
  const text = (ctx.text ?? "").trim();
  const outcome: TriggerOutcome = { matched: [], replied: false };
  if (!text) return outcome;
  const db = new Db(env.DB);
  const repo = new TriggersRepo(db);
  const triggers = await repo.enabled().catch(() => [] as Trigger[]);

  for (const trigger of triggers) {
    if (trigger.scope && trigger.scope !== "any" && trigger.scope !== ctx.channel) continue;
    if (trigger.run_once_per_conversation === 1 && (await alreadyHit(db, trigger.id, ctx.conversationId))) continue;
    if (!(await matches(env, trigger, text))) continue;

    outcome.matched.push(trigger.id);
    if (trigger.run_once_per_conversation === 1) await markHit(db, trigger.id, ctx.conversationId);

    const payload = TriggersRepo.parsePayload(trigger);
    try {
      switch (trigger.action) {
        case "label": {
          const label = String(payload.label ?? "").trim();
          if (label) await new ConversationLabelsRepo(db).add(ctx.conversationId, label, "trigger");
          break;
        }
        case "capture_lead": {
          await new LeadsRepo(db).create({
            conversationId: ctx.conversationId,
            channelUserId: ctx.channelUserId,
            intent: String(payload.intent ?? "Disparado por palabra clave"),
            notes: `trigger: ${trigger.name}`,
          });
          break;
        }
        case "handoff": {
          const { handoffHumanTool } = await import("../tools/handoffHuman");
          await handoffHumanTool(env, () => ctx.conversationId).execute!(
            { reason: "trigger", summary: String(payload.reason ?? trigger.name).slice(0, 300), category: "other" },
            {} as any,
          );
          break;
        }
        case "reply_fixed": {
          const msg = String(payload.message ?? "").trim();
          if (msg && !outcome.replied) {
            await sendAndRecord(env, ctx, db, msg);
            outcome.replied = true;
          }
          break;
        }
        case "reply_ai": {
          if (!outcome.replied) {
            const instruction = String(payload.instruction ?? "Responde al cliente de forma útil.").trim();
            const msg = await aiText(env, instruction, text);
            if (msg) {
              await sendAndRecord(env, ctx, db, msg);
              outcome.replied = true;
            }
          }
          break;
        }
        case "flow": {
          if (!outcome.replied) {
            const steps = await repo.steps(trigger.id);
            // Resolvemos el texto de cada paso ahora (los de IA se generan aquí),
            // y separamos los inmediatos de los diferidos (delay_minutes > 0).
            const delayed: { delayMinutes: number; text: string }[] = [];
            for (const step of steps) {
              const content =
                step.kind === "ai"
                  ? await aiText(env, step.content ?? "Responde al cliente.", text)
                  : step.content;
              if (!content) continue;
              if ((step.delay_minutes ?? 0) > 0) {
                delayed.push({ delayMinutes: step.delay_minutes, text: content });
              } else {
                await sendAndRecord(env, ctx, db, content);
              }
            }
            if (delayed.length) ctx.scheduleFlow?.(delayed);
            if (steps.length) outcome.replied = true;
          }
          break;
        }
      }
    } catch (e) {
      console.warn(`[triggers] acción ${trigger.action} falló (fail-open):`, e);
    }
  }

  return outcome;
}
