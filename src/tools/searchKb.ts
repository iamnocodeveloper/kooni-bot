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
      "términos del negocio o escala — nunca inventes. Si el score es alto, es un match " +
      "confiable: respóndele con esa información. Si el score es más bajo, es lo más " +
      "parecido que hay en la KB (ej. otro auto/producto similar, no el exacto que " +
      "pidieron) — ofrécelo igual como opción parecida en vez de decir que no hay nada.",
    inputSchema: z.object({
      query: z.string().min(2).describe("Pregunta o tema a buscar"),
    }),
    execute: async ({ query }) => {
      const res = await queryKb(env, query);
      if ("error" in res) return res;
      if (res.results.length === 0) return { results: [] };
      const min = await resolveKbMinScore(env);
      const strong = res.results.filter((r) => r.score >= min);
      // Nunca devolver vacío si la KB SÍ tiene algo relacionado: con el piso a
      // secas, el bot decía "no tengo esa información" aunque hubiera
      // inventario real adentro, solo porque ningún score llegó al mínimo (muy
      // común con listados de autos/productos — ver el comentario en
      // kb/query.ts sobre por qué el score real rara vez pasa de ~0.65). Si
      // nada cruzó el piso, se entregan los mejores igual: el score bajo ya le
      // dice al modelo (por la descripción de arriba) que son "parecidos", no
      // el match exacto.
      return { results: strong.length > 0 ? strong : res.results.slice(0, 3) };
    },
  });
}
