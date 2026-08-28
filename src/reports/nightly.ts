/**
 * Reporte nocturno (Forja+) — el "superpoder" del resumen del día.
 *
 * Cada noche (tick diario 0 3 * * *), DESPUÉS de que el analizador calificó las
 * conversaciones del día, el bot arma un resumen en lenguaje simple:
 *   👥 clientes atendidos · ✨ leads nuevos · 🔥 ventas calientes ·
 *   😤 clientes molestos · 🎫 tickets abiertos · 💬 temas del día
 * y se lo manda al dueño por Telegram y/o correo, según lo configurado en
 * /admin/config → "Reporte nocturno" (settings: nightly_report_enabled /
 * nightly_report_channel). También sirve para el botón "Enviar prueba ahora"
 * y para la tool del agente que responde preguntas del dueño sobre el día.
 */
import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";

const DAY_MS = 24 * 3600_000;

/** Módulo de pago que desbloquea el reporte (ver src/modules.ts). */
export const REPORT_MODULE_ID = "nightly_report";

export interface NightlyReportData {
  clientesAtendidos: number;
  leadsNuevos: number;
  ventasCalientes: { nombre: string; resumen: string }[];
  clientesMolestos: { nombre: string; resumen: string; sentimiento: string }[];
  ticketsAbiertos: number;
  temas: { tema: string; n: number }[];
  desde: number;
  hasta: number;
}

interface NameRow {
  display_name: string | null;
  channel_user_id: string | null;
}

function nombreDe(r: NameRow): string {
  return (r.display_name ?? r.channel_user_id ?? "Cliente").trim() || "Cliente";
}

/**
 * Junta los números del día (ventana de 24h) directamente de D1. No llama a la
 * IA: todo lo que reporta ya fue calculado por el analizador de insights.
 */
export async function buildNightlyReportData(env: Env, now = Date.now()): Promise<NightlyReportData> {
  const db = new Db(env.DB);
  const desde = now - DAY_MS;

  const [clientes, leads, ventas, molestos, tickets, topicsRows] = await Promise.all([
    db.first<{ n: number }>(
      `SELECT COUNT(DISTINCT c.id) as n FROM conversations c
       WHERE c.last_message_at > ?
         AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user' AND m.created_at > ?)
         AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'assistant' AND m.created_at > ?)`,
      [desde, desde, desde],
    ),
    db.first<{ n: number }>("SELECT COUNT(*) as n FROM leads WHERE created_at > ?", [desde]),
    db.all<{ display_name: string | null; channel_user_id: string | null; summary: string | null }>(
      `SELECT c.display_name, c.channel_user_id, i.summary
       FROM conversation_insights i
       LEFT JOIN conversations c ON c.id = i.conversation_id
       WHERE i.sale_opportunity = 1 AND i.analyzed_at > ?
       ORDER BY i.analyzed_at DESC LIMIT 5`,
      [desde],
    ),
    db.all<{ display_name: string | null; channel_user_id: string | null; summary: string | null; sentiment: string | null }>(
      `SELECT c.display_name, c.channel_user_id, i.summary, i.sentiment
       FROM conversation_insights i
       LEFT JOIN conversations c ON c.id = i.conversation_id
       WHERE i.sentiment IN ('frustrated', 'angry') AND i.analyzed_at > ?
       ORDER BY i.analyzed_at DESC LIMIT 5`,
      [desde],
    ),
    db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM tickets WHERE status != 'resolved' AND created_at > ?",
      [desde],
    ),
    db.all<{ topics: string | null }>(
      "SELECT topics FROM conversation_insights WHERE analyzed_at > ? AND topics IS NOT NULL",
      [desde],
    ),
  ]);

  // Agregar los temas del día (topics en JSON por conversación analizada).
  const counter = new Map<string, number>();
  for (const row of topicsRows ?? []) {
    try {
      const arr = JSON.parse(row.topics ?? "[]");
      for (const t of Array.isArray(arr) ? arr : []) {
        const k = String(t).trim().toLowerCase();
        if (k) counter.set(k, (counter.get(k) ?? 0) + 1);
      }
    } catch {
      /* topics corruptos se ignoran */
    }
  }
  const temas = [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tema, n]) => ({ tema, n }));

  return {
    clientesAtendidos: clientes?.n ?? 0,
    leadsNuevos: leads?.n ?? 0,
    ventasCalientes: (ventas ?? []).map((v) => ({ nombre: nombreDe(v), resumen: v.summary ?? "" })),
    clientesMolestos: (molestos ?? []).map((m) => ({
      nombre: nombreDe(m),
      resumen: m.summary ?? "",
      sentimiento: m.sentiment ?? "",
    })),
    ticketsAbiertos: tickets?.n ?? 0,
    temas,
    desde,
    hasta: now,
  };
}

/** Fecha legible para el encabezado del reporte (ej. "sábado 28 de agosto"). */
export function reportDateLabel(now: number, lang = "es"): string {
  try {
    return new Date(now).toLocaleDateString(lang, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

/** Formatea el resumen como mensaje de texto (Telegram/email/tool del agente). */
export function formatNightlyReport(data: NightlyReportData, businessName: string, fechaLabel?: string): string {
  const p = (n: number, s: string, pl: string) => `${n} ${n === 1 ? s : pl}`;
  const lines: string[] = [];
  lines.push(`🌙 Resumen de hoy — ${businessName || "Tu negocio"}`);
  if (fechaLabel) lines.push(`   ${fechaLabel}`);
  lines.push("");
  lines.push(`👥 ${p(data.clientesAtendidos, "cliente atendido", "clientes atendidos")}`);
  lines.push(`✨ ${p(data.leadsNuevos, "lead nuevo", "leads nuevos")}`);
  if (data.ventasCalientes.length > 0) {
    lines.push(`🔥 ${p(data.ventasCalientes.length, "venta caliente", "ventas calientes")}`);
  }
  if (data.clientesMolestos.length > 0) {
    lines.push(`😤 ${p(data.clientesMolestos.length, "cliente molesto", "clientes molestos")}`);
  }
  if (data.ticketsAbiertos > 0) {
    lines.push(`🎫 ${p(data.ticketsAbiertos, "ticket abierto", "tickets abiertos")}`);
  }
  if (data.temas.length > 0) {
    lines.push(`💬 Temas: ${data.temas.map((t) => t.tema).join(", ")}`);
  }

  if (data.ventasCalientes.length > 0) {
    lines.push("");
    lines.push("🔥 Ventas calientes:");
    for (const v of data.ventasCalientes) {
      lines.push(`• ${v.nombre}${v.resumen ? ` — ${v.resumen}` : ""}`);
    }
  }

  if (data.clientesMolestos.length > 0) {
    lines.push("");
    lines.push("😤 Clientes molestos:");
    for (const m of data.clientesMolestos) {
      lines.push(`• ${m.nombre}${m.resumen ? ` — ${m.resumen}` : ""}`);
    }
  }

  lines.push("");
  lines.push("Cierra tu día en 30 segundos. ✅");
  return lines.join("\n");
}

// ─── Envío por canal ─────────────────────────────────────────────────────────

async function sendTelegram(env: Env, text: string): Promise<boolean> {
  try {
    const { resolveTelegramToken, resolveOwnerTelegramChatId } = await import("../channels/telegramCredentials");
    const token = await resolveTelegramToken(env);
    const chatId = await resolveOwnerTelegramChatId(env);
    if (!token || !chatId) return false;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.ok;
  } catch (e) {
    console.error("[reporte nocturno] telegram falló:", e);
    return false;
  }
}

async function sendEmail(env: Env, text: string): Promise<boolean> {
  try {
    if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) return false;
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);
    const res = await resend.emails.send({
      from: `${env.BUSINESS_NAME || "Tu negocio"} Bot <onboarding@resend.dev>`,
      to: env.OWNER_EMAIL,
      subject: `🌙 Resumen del día — ${env.BUSINESS_NAME || "Tu negocio"}`,
      text: text,
      html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.6">${text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>`,
    });
    return Boolean(res.data);
  } catch (e) {
    console.error("[reporte nocturno] email falló:", e);
    return false;
  }
}

export interface ReportSendResult {
  sentTo: string[];
  reason?: string;
}

/** Canales efectivos según la config del panel (para la sección de Config). */
export async function reportChannelStatus(env: Env): Promise<{ telegram: boolean; email: boolean }> {
  const { resolveTelegramToken, resolveOwnerTelegramChatId } = await import("../channels/telegramCredentials");
  const [tgToken, tgChat, settings] = await Promise.all([
    resolveTelegramToken(env).catch(() => undefined),
    resolveOwnerTelegramChatId(env).catch(() => undefined),
    new SettingsRepo(new Db(env.DB)).all().catch(() => ({})),
  ]);
  return {
    telegram: Boolean(tgToken && tgChat),
    email: Boolean(env.RESEND_API_KEY && env.OWNER_EMAIL),
  };
}

async function doSend(env: Env, now: number): Promise<ReportSendResult> {
  // Gate de módulo de pago: sin el módulo (o Pro completo / override del dueño)
  // el reporte NO se envía. Fail-closed: es una feature premium.
  const { isModuleUnlocked } = await import("../modules");
  if (!(await isModuleUnlocked(env, REPORT_MODULE_ID))) {
    console.warn("[reporte nocturno] módulo no activado — se omite el envío");
    return { sentTo: [], reason: "module_locked" };
  }
  const settings = (await new SettingsRepo(new Db(env.DB)).all().catch(() => ({}))) as Record<string, string>;
  const channel = settings[SETTING_KEYS.nightlyReportChannel] ?? "telegram";
  const data = await buildNightlyReportData(env, now);
  const text = formatNightlyReport(data, env.BUSINESS_NAME, reportDateLabel(now, env.BOT_LANGUAGE ?? "es"));

  const sentTo: string[] = [];
  if (channel === "telegram" || channel === "both") {
    if (await sendTelegram(env, text)) sentTo.push("telegram");
  }
  if (channel === "email" || channel === "both") {
    if (await sendEmail(env, text)) sentTo.push("email");
  }
  return { sentTo };
}

/**
 * Entrada del tick nocturno: manda el reporte SOLO si el dueño lo activó en el
 * panel. No lanza si está apagado o no hay canales — es best-effort.
 */
export async function sendNightlyReport(env: Env, now = Date.now()): Promise<ReportSendResult> {
  const settings = (await new SettingsRepo(new Db(env.DB)).all().catch(() => ({}))) as Record<string, string>;
  if ((settings[SETTING_KEYS.nightlyReportEnabled] ?? "0") !== "1") {
    return { sentTo: [], reason: "disabled" };
  }
  return doSend(env, now);
}

/** Botón "Enviar prueba ahora" del panel: manda aunque esté apagado. */
export async function sendReportTest(env: Env, now = Date.now()): Promise<ReportSendResult> {
  return doSend(env, now);
}
