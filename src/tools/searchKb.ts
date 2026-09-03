import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { queryKb, resolveKbMinScore } from "../kb/query";

export type { KbHit as SearchKbResult } from "../kb/query";

export function searchKbTool(env: Env) {
  return tool({
    description:
      "Busca en el knowledge base del negocio. Devuelve los fragmentos relevantes " +
      "(cada uno con su score 0-1). Si viene VACÍO, la KB no cubre el tema: dilo en " +
      "términos del negocio o escala — nunca inventes. Si trae fragmentos, son " +
      "confiables: respóndele al cliente con esa información.",
    inputSchema: z.object({
      query: z.string().min(2).describe("Pregunta o tema a buscar"),
    }),
    execute: async ({ query }) => {
      const res = await queryKb(env, query);
      if ("error" in res) return res;
      const min = await resolveKbMinScore(env);
      return { results: res.results.filter((r) => r.score >= min) };
    },
  });
}
