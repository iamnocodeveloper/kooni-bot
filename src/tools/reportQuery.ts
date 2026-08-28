import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { buildNightlyReportData, formatNightlyReport, reportDateLabel } from "../reports/nightly";

/**
 * Tool del reporte del día (Forja+): el dueño puede preguntarle a su bot en su
 * chat privado por los números del día — clientes atendidos, leads, ventas
 * calientes, clientes molestos — y el bot responde con el mismo resumen que
 * llega cada noche. Solo consulta D1; no gasta tokens de análisis.
 */
export function reportQueryTool(env: Env) {
  return tool({
    description:
      "Consulta el reporte del día del negocio: clientes atendidos, leads nuevos, ventas calientes (con nombre y detalle), clientes molestos y temas del día. ÚSALA cuando el DUEÑO pregunte por el reporte, los números del día, ventas calientes o clientes molestos (ej. '¿cómo fue el día?', '¿quiénes son las ventas calientes?').",
    inputSchema: z.object({
      detalle: z
        .string()
        .optional()
        .describe("Qué quiere saber el dueño (opcional): todo, ventas, molestos, leads…"),
    }),
    execute: async ({ detalle }) => {
      const now = Date.now();
      const data = await buildNightlyReportData(env, now);
      const texto = formatNightlyReport(data, env.BUSINESS_NAME, reportDateLabel(now, env.BOT_LANGUAGE ?? "es"));
      return { texto, detalle: detalle ?? "todo" };
    },
  });
}
