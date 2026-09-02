import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { queryKb } from "../kb/query";

export type { KbHit as SearchKbResult } from "../kb/query";

export function searchKbTool(env: Env) {
  return tool({
    description:
      "Busca en el knowledge base del negocio. Devuelve top-5 chunks con score 0-1. Si top-1 score < 0.7 no hay match útil — escala.",
    inputSchema: z.object({
      query: z.string().min(2).describe("Pregunta o tema a buscar"),
    }),
    execute: async ({ query }) => queryKb(env, query),
  });
}
