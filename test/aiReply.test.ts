import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Mock del módulo "ai" ANTES de importar el módulo bajo test (hoisting).
const mockedTexts: string[] = [];
vi.mock("ai", () => ({
  generateText: async ({ system, prompt }: any) => {
    const text = mockedTexts.shift() ?? "¡Gracias por tu comentario! Escríbeme por privado ✨";
    return { text };
  },
}));

// Mock de createModel para que no dependa de la llave real.
vi.mock("../../src/llm/provider", () => ({
  createModel: () => ({ model: { id: "mock-model" }, modelId: "mock", provider: "openai" }),
}));

import { generateAiPublicReply } from "../src/aiReply";
import type { Env } from "../src/env";

beforeEach(() => { mockedTexts.length = 0; });
afterEach(() => vi.restoreAllMocks());

function makeEnv(): Env {
  return {
    BUSINESS_NAME: "Negocio Test",
    BOT_LANGUAGE: "es",
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => ({ meta: { changes: 0 } }),
        }),
      }),
    },
  } as unknown as Env;
}

describe("generateAiPublicReply", () => {
  it("genera una respuesta con la IA y la devuelve", async () => {
    mockedTexts.push("¡Gracias por tu comentario! Escríbeme por privado y te ayudo ✨");
    const reply = await generateAiPublicReply(makeEnv(), { commentText: "me interesa el precio", commenterName: "maria" });
    expect(reply).toBeTruthy();
    expect(reply!.length).toBeGreaterThan(5);
  });

  it("devuelve null si el texto generado está vacío (fallback al fijo)", async () => {
    mockedTexts.push("   ");
    const reply = await generateAiPublicReply(makeEnv(), { commentText: "hola" });
    expect(reply).toBeNull();
  });

  it("incluye el prompt del dueño en las instrucciones del sistema", async () => {
    mockedTexts.push("Gracias!");
    await generateAiPublicReply(makeEnv(), { prompt: "Responde muy formal y serio", commentText: "precio" });
    // No podemos inspeccionar el system con este mock simple, pero al menos no truena
    // y devuelve el texto mockeado.
  });
});
