/**
 * Live eval runner — corre los escenarios de eval contra el bot DESPLEGADO
 * (o cualquier endpoint configurable) y usa Claude Sonnet 4.x como JUEZ.
 *
 * Esto es un script CLI (`pnpm eval`), NO un test de vitest:
 *  - NO corre en la suite de tests.
 *  - NO hace red en CI (solo cuando se invoca manualmente con las env vars puestas).
 *
 * Uso:
 *   ANTHROPIC_API_KEY=... BOT_URL=https://mi-bot.workers.dev \
 *   TELEGRAM_BOT_TOKEN=... [EVAL_THRESHOLD=0.85] [EVAL_WAIT_MS=20000] \
 *   pnpm eval
 *
 * Fuente de escenarios: test/fixtures/eval-scenarios.json (vía
 * scripts/eval-scenarios.ts) — la única fuente de verdad, compartida con los
 * tests unitarios.
 *
 * El judge se construye con AI SDK v6 (`ai` + `@ai-sdk/anthropic`), NO con el
 * SDK crudo de Anthropic (este repo no depende de `@anthropic-ai/sdk`).
 *
 * NOTA de diseño: toda la lógica de scoring/parsing es PURA y exportada
 * (parseJudgeVerdict, scoreResults, summarize) para poder testearla con el
 * judge mockeado, sin red. `main()` solo se ejecuta cuando este archivo es el
 * entrypoint del proceso.
 */

import process from "node:process";
import { generateText, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { evalScenarios } from "./eval-scenarios";
import {
  JUDGE_MODEL,
  DEFAULT_THRESHOLD,
  parseJudgeVerdict,
  scoreResults,
  buildJudgePrompt,
  summarize,
  type EvalFixture,
  type JudgeVerdict,
  type EvalResult,
} from "../src/lab/judge";

export const DEFAULT_WAIT_MS = 20_000;

// --- Capa con efectos (red). No se ejecuta al importar. ---

/** Envía el mensaje del fixture al webhook de Telegram del bot desplegado. */
async function sendToBot(
  botUrl: string,
  text: string,
  chatId = 99_999,
): Promise<void> {
  const fakeUpdate = {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: 1,
      from: { id: chatId, first_name: "EvalUser", is_bot: false },
      chat: { id: chatId, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
  const res = await fetch(`${botUrl}/webhooks/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fakeUpdate),
  });
  if (!res.ok) {
    throw new Error(`Webhook devolvió ${res.status} ${res.statusText}`);
  }
}

/**
 * Recupera la respuesta del bot desde la API de Telegram (getUpdates).
 * El bot responde vía sendMessage; aquí leemos esos mensajes salientes.
 * Devuelve el último texto enviado a `chatId`, o "" si no hay.
 */
async function fetchBotReply(
  tgToken: string,
  chatId = 99_999,
): Promise<string> {
  const res = await fetch(
    `https://api.telegram.org/bot${tgToken}/getUpdates?limit=20`,
  );
  if (!res.ok) return "";
  const data = (await res.json()) as {
    ok: boolean;
    result?: Array<{
      message?: { chat?: { id?: number }; text?: string };
    }>;
  };
  if (!data.ok || !Array.isArray(data.result)) return "";
  const replies = data.result
    .map((u) => u.message)
    .filter((m) => m?.chat?.id === chatId && typeof m?.text === "string")
    .map((m) => m!.text as string);
  return replies.at(-1) ?? "";
}

/** Pide al juez Sonnet un veredicto sobre la respuesta del bot. */
async function judgeOne(
  model: LanguageModel,
  fix: EvalFixture,
  botReply: string,
): Promise<JudgeVerdict> {
  const { text } = await generateText({
    model,
    maxOutputTokens: 200,
    prompt: buildJudgePrompt(fix, botReply),
  });
  return parseJudgeVerdict(text);
}

async function loadFixtures(): Promise<EvalFixture[]> {
  // Single source of truth: src/lab/scenarios.ts (+ scenarios.json), via the
  // typed accessor in scripts/eval-scenarios.ts (same set the unit tests validate).
  if (!Array.isArray(evalScenarios) || evalScenarios.length === 0) {
    throw new Error("No hay escenarios en src/lab/scenarios.json.");
  }
  return evalScenarios;
}

async function main(): Promise<void> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const BOT_URL = process.env.BOT_URL;
  const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const threshold = process.env.EVAL_THRESHOLD
    ? Number(process.env.EVAL_THRESHOLD)
    : DEFAULT_THRESHOLD;
  const waitMs = process.env.EVAL_WAIT_MS
    ? Number(process.env.EVAL_WAIT_MS)
    : DEFAULT_WAIT_MS;

  if (!ANTHROPIC_KEY || !BOT_URL || !TG_TOKEN) {
    console.error(
      "Faltan env vars. Necesitas: ANTHROPIC_API_KEY, BOT_URL, TELEGRAM_BOT_TOKEN.",
    );
    process.exit(1);
  }

  const fixtures = await loadFixtures();
  const anthropic = createAnthropic({ apiKey: ANTHROPIC_KEY });
  const model = anthropic(JUDGE_MODEL);

  const results: EvalResult[] = [];
  for (const fix of fixtures) {
    console.log(`Corriendo ${fix.id}...`);
    try {
      await sendToBot(BOT_URL, fix.userMessage);
      await new Promise((r) => setTimeout(r, waitMs));
      const botReply = await fetchBotReply(TG_TOKEN);
      const verdict = await judgeOne(model, fix, botReply);
      results.push({ id: fix.id, ...verdict });
      console.log(`  ${verdict.passed ? "✓" : "✗"} ${verdict.reason}`);
    } catch (err) {
      const reason = `Error corriendo escenario: ${(err as Error).message}`;
      results.push({ id: fix.id, passed: false, reason });
      console.log(`  ✗ ${reason}`);
    }
  }

  const summary = scoreResults(results, threshold);
  console.log("\n" + summarize(summary));
  process.exit(summary.meetsThreshold ? 0 : 1);
}

// Solo corre la red cuando este archivo es el entrypoint (no al importarlo en tests).
const isEntrypoint =
  typeof process.argv[1] === "string" &&
  import.meta.url === `file://${process.argv[1]}`;

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
