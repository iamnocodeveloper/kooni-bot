// Uso del sistema por instalación: métricas + costos de IA, para el panel de
// licencias del dueño (kooni-licencias). El worker las calcula desde su D1 y las
// PUSHEA periódicamente (cron nocturno) a la función `registrar-uso` de InsForge
// si `USAGE_PUSH_URL` está definida. No expone datos personales: solo conteos
// agregados y costo estimado de IA (tokens × precio del modelo, ver pricing.ts).
import type { Env } from "./env";
import { Db } from "./db/client";
import { costOfUsage, type ModelId } from "./pricing";

export interface UsageReport {
  uid: string;
  workerUrl: string;
  botName: string;
  /** Tier REAL (licencia v2 verificada), no la var BOT_TIER. */
  tier: string;
  /** Ids de módulos de pago desbloqueados en esta instalación. Sirve para ver,
   *  a través de todas las instalaciones, qué módulos se usan de verdad. */
  modulos: string[];
  fecha: string;
  conteos: {
    conversaciones30: number;
    mensajes30: number;
    mensajesBot30: number;
    leads30: number;
    contactos: number;
    reglas: number;
    autoDms30: number;
    canales30: { canal: string; mensajes: number }[];
    tools30: { tool: string; n: number }[];
  };
  costos: {
    ia30: number;
    iaHoy: number;
    porModelo: { modelo: string; mensajes: number; costo: number }[];
  };
}

const DIA_MS = 86_400_000;

/** Métricas agregadas de la instalación (últimos 30 días + totales). */
export async function collectUsage(env: Env): Promise<UsageReport> {
  const db = new Db(env.DB);
  const treinta = Date.now() - 30 * DIA_MS;
  const hoy = new Date().toISOString().slice(0, 10);

  const [
    convs30, msgs30, botMsgs30, leads30, contactos, reglas, autoDms30, canales30, tools30, tokenRows,
  ] = await Promise.all([
    db.first<{ n: number }>("SELECT COUNT(DISTINCT conversation_id) as n FROM messages WHERE created_at > ?", [treinta]),
    db.first<{ n: number }>("SELECT COUNT(*) as n FROM messages WHERE created_at > ?", [treinta]),
    db.first<{ n: number }>("SELECT COUNT(*) as n FROM messages WHERE role = 'assistant' AND created_at > ?", [treinta]),
    db.first<{ n: number }>("SELECT COUNT(*) as n FROM leads WHERE created_at > ?", [treinta]),
    db.first<{ n: number }>("SELECT COUNT(*) as n FROM contacts").catch(() => ({ n: 0 } as { n: number })),
    db.first<{ n: number }>("SELECT COUNT(*) as n FROM auto_rules").catch(() => ({ n: 0 } as { n: number })),
    db.first<{ n: number }>("SELECT COUNT(*) as n FROM dm_logs WHERE created_at > ?", [treinta]).catch(() => ({ n: 0 } as { n: number })),
    db.all<{ canal: string; mensajes: number }>(
      `SELECT c.channel as canal, COUNT(m.id) as mensajes
       FROM messages m JOIN conversations c ON m.conversation_id = c.id
       WHERE m.created_at > ? GROUP BY c.channel ORDER BY mensajes DESC`,
      [treinta],
    ),
    db
      .all<{ tool: string; n: number }>(
        `SELECT json_extract(value, '$.toolName') as tool, COUNT(*) as n
         FROM messages, json_each(messages.tool_calls)
         WHERE messages.tool_calls IS NOT NULL AND messages.created_at > ?
         GROUP BY tool ORDER BY n DESC`,
        [treinta],
      )
      .catch(() => [] as { tool: string; n: number }[]),
    db.all<{ model_used: string; day: string; input: number; output: number; cached: number; msgs: number }>(
      `SELECT date(created_at / 1000, 'unixepoch') as day, model_used,
              SUM(COALESCE(input_tokens, 0)) as input,
              SUM(COALESCE(output_tokens, 0)) as output,
              SUM(COALESCE(cached_input_tokens, 0)) as cached,
              COUNT(*) as msgs
       FROM messages WHERE created_at > ? AND model_used IS NOT NULL
       GROUP BY day, model_used`,
      [treinta],
    ),
  ]);

  let ia30 = 0;
  let iaHoy = 0;
  const porModelo = new Map<string, { mensajes: number; costo: number }>();
  for (const r of tokenRows) {
    const costo = costOfUsage(r.model_used as ModelId, { input: r.input, output: r.output, cached: r.cached });
    ia30 += costo;
    if (r.day === hoy) iaHoy += costo;
    const m = porModelo.get(r.model_used) ?? { mensajes: 0, costo: 0 };
    m.mensajes += r.msgs;
    m.costo += costo;
    porModelo.set(r.model_used, m);
  }

  // Tier real = licencia v2 válida (BOT_TIER ya no desbloquea nada; ver PLAN.md
  // § Licencias v2). Fail-open a "free" para no romper nunca el cron de uso.
  let proReal = false;
  let modulosActivos = new Set<string>();
  try {
    const { isProUnlocked } = await import("./config");
    const { unlockedModules } = await import("./modules");
    proReal = await isProUnlocked(env);
    modulosActivos = await unlockedModules(env);
  } catch (e) {
    console.warn("[usage] no se pudo leer el tier real:", e);
  }

  return {
    uid: env.BOT_INSTANCE_ID || "",
    workerUrl: env.DASHBOARD_BASE_URL || "",
    botName: env.BOT_NAME || "",
    tier: proReal ? "pro" : "free",
    modulos: [...modulosActivos].sort(),
    fecha: new Date().toISOString(),
    conteos: {
      conversaciones30: convs30?.n ?? 0,
      mensajes30: msgs30?.n ?? 0,
      mensajesBot30: botMsgs30?.n ?? 0,
      leads30: leads30?.n ?? 0,
      contactos: contactos?.n ?? 0,
      reglas: reglas?.n ?? 0,
      autoDms30: autoDms30?.n ?? 0,
      canales30: canales30.map((c) => ({ canal: c.canal, mensajes: c.mensajes })),
      tools30: tools30.filter((t) => t.tool).map((t) => ({ tool: t.tool, n: t.n })),
    },
    costos: {
      ia30,
      iaHoy,
      porModelo: [...porModelo.entries()].map(([modelo, v]) => ({ modelo, mensajes: v.mensajes, costo: v.costo })),
    },
  };
}

/** Push del reporte al panel de licencias (nunca rompe el cron). Devuelve un
 *  resumen para el trigger manual `/usage/push` (que sí lo muestra). */
export async function pushUsage(env: Env): Promise<{ ok: boolean; detail?: string }> {
  const url = env.USAGE_PUSH_URL;
  if (!url) return { ok: false, detail: "USAGE_PUSH_URL no configurada" };
  try {
    const report = await collectUsage(env);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Kooni-Token": env.KOONI_REGISTER_TOKEN || "" },
      body: JSON.stringify(report),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[usage] push rechazado HTTP ${res.status}: ${body}`);
      return { ok: false, detail: `HTTP ${res.status} ${body.slice(0, 120)}` };
    }
    console.log(`[usage] reporte enviado (${report.conteos.mensajes30} msgs 30d, IA $${report.costos.ia30.toFixed(2)})`);
    return { ok: true };
  } catch (e) {
    console.error("[usage] push falló:", e);
    return { ok: false, detail: String((e as Error)?.message || e) };
  }
}
