import type { Env } from "../env";
import type { SystemModelMessage } from "ai";
import { streamText } from "ai";
import { buildTools } from "../tools";
import { resolveAgentConfig } from "../settings-loader";
import { createModel } from "../llm/provider";
import type { Tier } from "../upgrade/modelSelector";

// "Probar el bot" — corre un turno del agente REAL (mismo system prompt, mismo
// modelo, misma KB) contra un mensaje escrito por el dueño, SIN tocar nada:
//   - no persiste conversación ni mensajes,
//   - no manda nada por ningún canal,
//   - solo deja las tools de LECTURA (searchKb, catalogQuery). Las de acción
//     (captureLead, handoffHuman, scheduleAppointment…) NO están: en prueba no
//     se capturan leads ni se crean tickets de mentira. El bot responde igual,
//     solo que "conversando" en vez de ejecutar.

export interface TestTurnResult {
  reply: string;
  toolCalls: { toolName: string; input: unknown; output?: unknown }[];
  model: string;
}

// En prueba: solo herramientas de LECTURA (no capturan leads ni crean tickets).
// `enviarRecurso` SÍ se permite, pero corre en modo simulado (sin canal): no
// manda nada y devuelve el recurso para previsualizarlo en el chat de prueba.
const READ_ONLY_TOOLS = new Set([
  "searchKb",
  "catalogQuery",
  "reportQuery",
  "inventarioQuery",
  "buscarPropiedad",
  "enviarRecurso",
]);

const TEST_NOTE = `<modo_prueba>
Estás en una prueba interna del dueño del negocio, no con un cliente real. Las
herramientas de acción (capturar lead, agendar, pasar a un humano) NO están
disponibles: si normalmente las usarías, sigue la conversación con naturalidad y
di lo que le dirías al cliente (ej. "te tomaría los datos y te contactamos").
La Galería SÍ está disponible: si corresponde, llama enviarRecurso con el nombre
del recurso (se mostrará como vista previa; en la prueba no se envía nada).
</modo_prueba>`;

export async function runTestTurn(
  env: Env,
  history: { role: "user" | "assistant"; content: string }[],
  text: string,
): Promise<TestTurnResult> {
  const allTools = await buildTools({ env, getConversationId: () => null });
  const tools = Object.fromEntries(
    Object.entries(allTools).filter(([name]) => READ_ONLY_TOOLS.has(name)),
  );

  const cfg = await resolveAgentConfig(env, Object.keys(tools));

  const tier: Tier =
    cfg.modelOverride === "haiku" ? "fast" : cfg.modelOverride === "sonnet" ? "smart" : "smart";
  const { model, modelId } = createModel(env, tier, cfg.llm);

  const system: SystemModelMessage[] = [
    { role: "system", content: cfg.systemPrompt },
    { role: "system", content: TEST_NOTE },
  ];

  const messages = [
    ...history.slice(-16).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: text },
  ];

  const result = streamText({
    model,
    system,
    messages,
    tools,
    stopWhen: ({ steps }) => steps.length >= 6,
    ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
  });

  let reply = "";
  for await (const chunk of result.textStream) reply += chunk;

  const steps = await result.steps;
  const toolCalls = steps.flatMap((s) =>
    (s.toolCalls ?? []).map((tc: { toolCallId?: string; toolName: string; input: unknown }) => {
      const tr = (s.toolResults ?? []).find(
        (r: { toolCallId?: string }) => r.toolCallId && r.toolCallId === tc.toolCallId,
      ) as { output?: unknown } | undefined;
      return { toolName: tc.toolName, input: tc.input, ...(tr ? { output: tr.output } : {}) };
    }),
  );

  return {
    reply: reply.trim() || "(el bot no devolvió texto)",
    toolCalls,
    model: modelId,
  };
}
