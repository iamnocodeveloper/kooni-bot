// Runner del Laboratorio: corre un escenario contra el agente REAL (mismo system
// prompt, mismo modelo configurado, misma KB) en modo SANDBOX — sin persistir
// conversaciones/mensajes/leads/tickets y sin mandar nada por ningún canal.
// "Rápido" = un turno; "persona" = multi-turno con un cliente simulado.
import type { SystemModelMessage } from "ai";
import { streamText } from "ai";
import type { Env } from "../env";
import { buildTools } from "../tools";
import { resolveAgentConfig } from "../settings-loader";
import { createModel } from "../llm/provider";
import { costOfUsage } from "../pricing";
import { currentDateLine } from "../system-prompt";
import type { Tier } from "../upgrade/modelSelector";
import { nextClientMessage, FIN, type SimMsg } from "./simulator";
import type { LabScenario } from "./scenarios";

export interface LabToolCall {
  toolName: string;
  input: unknown;
  output?: unknown;
}

export interface TurnResult {
  reply: string;
  toolCalls: LabToolCall[];
  tokens: { input: number; output: number; cached: number };
}

export interface LabRunResult {
  transcript: SimMsg[];
  reply: string;
  toolCalls: LabToolCall[];
  model: string;
  turns: number;
  tokens: { input: number; output: number; cached: number };
  cost: number;
}

/** Corre UN turno del agente (streamText + drain + tool calls). Compartido con el playground. */
export async function agentTurn(
  model: unknown,
  system: SystemModelMessage[],
  messages: { role: "user" | "assistant"; content: string }[],
  tools: Record<string, unknown>,
  temperature?: number,
): Promise<TurnResult> {
  const result = streamText({
    model: model as never,
    system,
    messages,
    tools: tools as never,
    stopWhen: ({ steps }) => steps.length >= 6,
    ...(temperature !== undefined ? { temperature } : {}),
  });

  let reply = "";
  for await (const chunk of result.textStream) reply += chunk;

  const steps = await result.steps;
  const toolCalls: LabToolCall[] = steps.flatMap((s) =>
    (s.toolCalls ?? []).map((tc: { toolCallId?: string; toolName: string; input: unknown }) => {
      const tr = (s.toolResults ?? []).find(
        (r: { toolCallId?: string }) => r.toolCallId && r.toolCallId === tc.toolCallId,
      ) as { output?: unknown } | undefined;
      return { toolName: tc.toolName, input: tc.input, ...(tr ? { output: tr.output } : {}) };
    }),
  );

  const usage = (await result.usage) as {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  };
  const tokens = {
    input: usage.inputTokens ?? 0,
    output: usage.outputTokens ?? 0,
    cached: usage.cachedInputTokens ?? 0,
  };

  return { reply: reply.trim(), toolCalls, tokens };
}

const LAB_NOTE = `<modo_laboratorio>
Estás en una PRUEBA INTERNA del dueño (Laboratorio), no con un cliente real.
Además, este cliente es SIMULADO. Conversá normalmente y, cuando corresponda,
usá las herramientas de acción: se registran pero NO tienen efecto real (no se
crean leads, tickets ni pedidos). El objetivo es medir tu comportamiento.
</modo_laboratorio>`;

/** Ejecuta un escenario completo (rápido o persona) en el sandbox. */
export async function runLabScenario(env: Env, scenario: LabScenario): Promise<LabRunResult> {
  const tools = await buildTools({ env, getConversationId: () => null, sandbox: true });
  const cfg = await resolveAgentConfig(env, Object.keys(tools));

  const tier: Tier =
    cfg.modelOverride === "haiku" ? "fast" : cfg.modelOverride === "sonnet" ? "smart" : "smart";
  const { model, modelId } = createModel(env, tier, cfg.llm);

  const system: SystemModelMessage[] = [
    { role: "system", content: cfg.systemPrompt },
    { role: "system", content: currentDateLine(cfg.timezone) },
    { role: "system", content: LAB_NOTE },
  ];

  const transcript: SimMsg[] = [];
  const allToolCalls: LabToolCall[] = [];
  const maxTurns = scenario.persona?.maxTurns ?? scenario.maxTurns ?? 1;
  let lastReply = "";

  // Escenario rápido: un único mensaje del cliente.
  if (scenario.kind === "single" || !scenario.persona) {
    const userMessage = scenario.userMessage ?? "";
    const turn = await agentTurn(
      model,
      system,
      [{ role: "user", content: userMessage }],
      tools,
      cfg.temperature,
    );
    transcript.push({ role: "user", content: userMessage });
    if (turn.reply) transcript.push({ role: "assistant", content: turn.reply });
    return {
      transcript,
      reply: turn.reply,
      toolCalls: turn.toolCalls,
      model: modelId,
      turns: 1,
      tokens: turn.tokens,
      cost: costOfUsage(modelId as never, turn.tokens),
    };
  }

  // Persona: bucle agente ↔ cliente simulado.
  let tokens = { input: 0, output: 0, cached: 0 };
  for (let turn = 0; turn < maxTurns; turn++) {
    const userMessage = await nextClientMessage(env, scenario.persona, transcript, turn);
    if (userMessage === FIN || !userMessage) break;
    transcript.push({ role: "user", content: userMessage });

    const res = await agentTurn(
      model,
      system,
      transcript.map((m) => ({ role: m.role, content: m.content })),
      tools,
      cfg.temperature,
    );
    allToolCalls.push(...res.toolCalls);
    tokens = {
      input: tokens.input + res.tokens.input,
      output: tokens.output + res.tokens.output,
      cached: tokens.cached + res.tokens.cached,
    };
    if (res.reply) {
      transcript.push({ role: "assistant", content: res.reply });
      lastReply = res.reply;
    }
  }

  return {
    transcript,
    reply: lastReply,
    toolCalls: allToolCalls,
    model: modelId,
    turns: transcript.filter((m) => m.role === "user").length,
    tokens,
    cost: costOfUsage(modelId as never, tokens),
  };
}
