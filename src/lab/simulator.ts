// Simulador de CLIENTE del Laboratorio: dado un guion de persona y lo que va de
// la conversación, genera el SIGUIENTE mensaje del cliente simulado con el
// modelo barato (fast). Es lo que hace "multi-turno" al Laboratorio: un cliente
// de mentira que insiste, pregunta y se queja, contra el agente real.
import { generateText } from "ai";
import type { Env } from "../env";
import { createModel } from "../llm/provider";
import { loadLlmOverrides } from "../settings-loader";

export interface SimPersona {
  goal: string;
  opening: string;
  style: string;
  maxTurns: number;
}

export interface SimMsg {
  role: "user" | "assistant";
  content: string;
}

export const FIN = "[FIN]";

/**
 * Devuelve el próximo mensaje del cliente simulado. En el turno 0 devuelve la
 * apertura; después, el modelo encarna la persona. Si el modelo decide que ya
 * terminó, devuelve `[FIN]`.
 */
export async function nextClientMessage(
  env: Env,
  persona: SimPersona,
  transcript: SimMsg[],
  turn: number,
): Promise<string> {
  if (turn === 0) return persona.opening;

  const ov = await loadLlmOverrides(env);
  const { model } = createModel(env, "fast", ov);

  const convo = transcript
    .map((m) => `${m.role === "user" ? "CLIENTE" : "NEGOCIO"}: ${m.content}`)
    .join("\n");

  const prompt = `Estás simulando a un CLIENTE que escribe por chat a un negocio, para probar al bot del negocio.
NO eres el bot: eres la persona que escribe.

TU OBJETIVO: ${persona.goal}
TU ESTILO: ${persona.style}

CONVERSACIÓN HASTA AHORA:
${convo || "(todavía nada)"}

Escribí SOLO el siguiente mensaje del CLIENTE: una línea corta y natural, en el mismo idioma de la conversación.
No expliques, no uses comillas, no pongas "CLIENTE:".
Si YA cumpliste tu objetivo, o el bot te resolvió (o te cansaste), respondé exactamente ${FIN}.`;

  const { text } = await generateText({ model, prompt, maxOutputTokens: 120 });
  return text.trim();
}
