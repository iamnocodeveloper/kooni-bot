// Motor de cobranza (nicho `cartera`). Corre en el tick nocturno (y se puede
// disparar a mano): recorre las reglas de mora activas y manda un recordatorio
// por el canal del deudor, respetando intentos máximos, cooldown y un tope por
// corrida. Registra cada gestión en la cartera y en el hilo del CRM.
//
// Reglas de oro (anti-spam):
//   - nunca más de `max_attempts` por cuenta,
//   - nunca antes de `COOLDOWN_HOURS` desde el último contacto,
//   - tope duro de `MAX_PER_RUN` mensajes por corrida,
//   - fail-soft: un deudor que falle no corta la corrida.
import type { Env } from "../env";
import { Db } from "../db/client";
import { CollectionsRepo, normalizePhone } from "../db/collections";
import { ConversationsRepo } from "../db/conversations";
import { MessagesRepo } from "../db/messages";

/** No contactar al mismo deudor más seguido que esto. */
const COOLDOWN_HOURS = 20;
/** Tope duro por corrida (protege de ráfagas y de costos). */
const MAX_PER_RUN = 25;

export interface CollectionRunResult {
  rules: number;
  sent: number;
  skipped: number;
  failed: number;
  promisesBroken: number;
  promiseReminders: number;
}

function fmtMoney(n: number, currency = "USD"): string {
  return (currency === "USD" ? "$" : `${currency} `) + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().slice(0, 10);
}

/** Reemplaza {variables} de la plantilla con datos reales del deudor. */
export function renderCollectionTemplate(
  template: string,
  vars: { nombre: string; negocio: string; saldo: string; monto: string; vence: string; dias: string },
): string {
  return template.replace(/\{(nombre|negocio|saldo|monto|vence|dias)\}/gi, (_, k: string) => {
    return vars[k.toLowerCase() as keyof typeof vars] ?? "";
  });
}

const DEFAULT_TEMPLATE =
  "Hola {nombre}, te escribimos de {negocio}. Tenés un saldo pendiente de {saldo} " +
  "(vencido el {vence}, {dias} días). ¿Podemos coordinar el pago? Respondé este mensaje y lo vemos.";

/**
 * A dónde mandar el mensaje: si el deudor ya tiene conversación, por ese canal
 * (para que el CRM lo muestre y el bot siga el hilo); si no, por WAHA si está
 * configurado. Sin destino → se omite (no se inventa un canal).
 */
async function resolveDestination(
  env: Env,
  db: Db,
  phone: string | null,
): Promise<{ channel: string; channelUserId: string } | null> {
  const digits = normalizePhone(phone);
  if (digits.length >= 6) {
    const tail = digits.slice(-10);
    const conv = await db.first<{ channel: string; channel_user_id: string }>(
      "SELECT channel, channel_user_id FROM conversations WHERE REPLACE(REPLACE(channel_user_id,'+',''),' ','') LIKE ? ORDER BY last_message_at DESC LIMIT 1",
      [`%${tail}%`],
    );
    if (conv?.channel && conv.channel_user_id) return { channel: conv.channel, channelUserId: conv.channel_user_id };
  }
  const { resolveWahaConfig } = await import("../channels/wahaCredentials");
  const cfg = await resolveWahaConfig(env).catch(() => null);
  if (cfg?.base && digits.length >= 8) return { channel: "waha", channelUserId: `${digits}@c.us` };
  return null;
}

export async function runCollections(env: Env): Promise<CollectionRunResult> {
  const out: CollectionRunResult = { rules: 0, sent: 0, skipped: 0, failed: 0, promisesBroken: 0, promiseReminders: 0 };
  const db = new Db(env.DB);
  const repo = new CollectionsRepo(db);
  const convs = new ConversationsRepo(db);
  const msgs = new MessagesRepo(db);
  const now = Date.now();
  const cooldownMs = COOLDOWN_HOURS * 3_600_000;

  const rules = (await repo.listRules()).filter((r) => Number(r.active) === 1);
  out.rules = rules.length;
  if (rules.length === 0) {
    // Sin reglas: igual marcamos promesas vencidas.
    out.promisesBroken = await repo.markBrokenPromises().catch(() => 0);
    return out;
  }

  const { pickAdapter } = await import("../replies/sender");
  const businessName = env.BUSINESS_NAME ?? "el negocio";

  // ── Recordatorios por mora ────────────────────────────────────────────────
  for (const rule of rules) {
    if (out.sent >= MAX_PER_RUN) break;
    const accounts = await repo
      .accountsInOverdueRange(Number(rule.min_days_overdue ?? 0), rule.max_days_overdue ?? null, 50)
      .catch(() => []);
    for (const acc of accounts) {
      if (out.sent >= MAX_PER_RUN) break;
      try {
        const debtor = await repo.getDebtor(acc.debtor_id);
        if (!debtor) {
          out.skipped++;
          continue;
        }
        const caseId = await repo.ensureCase(debtor.id, acc.account_id);
        const c = await db.first<{ attempts: number; last_contact_at: number | null; next_contact_at: number | null }>(
          "SELECT attempts, last_contact_at, next_contact_at FROM collection_cases WHERE id = ?",
          [caseId],
        );
        const attempts = Number(c?.attempts ?? 0);
        if (attempts >= Number(rule.max_attempts ?? 3)) {
          out.skipped++;
          continue;
        }
        if (c?.last_contact_at && now - c.last_contact_at < cooldownMs) {
          out.skipped++;
          continue;
        }
        if (c?.next_contact_at && c.next_contact_at > now) {
          out.skipped++;
          continue;
        }
        const dest = await resolveDestination(env, db, debtor.phone);
        if (!dest) {
          out.skipped++;
          continue;
        }
        const balance = Number(acc.amount) - Number(acc.paid);
        const dias = Math.max(0, Math.floor((now - Number(acc.due_date)) / 86_400_000));
        const text = renderCollectionTemplate(rule.template || DEFAULT_TEMPLATE, {
          nombre: debtor.name || "buenas tardes",
          negocio: businessName,
          saldo: fmtMoney(balance, acc.currency),
          monto: fmtMoney(balance, acc.currency),
          vence: fmtDate(acc.due_date),
          dias: String(dias),
        });

        // Guardar en el hilo del CRM (para que el dueño vea el recordatorio) y enviar.
        const conv = await convs.getOrCreate(dest.channel, dest.channelUserId, debtor.name ?? undefined);
        await pickAdapter(dest.channel as any).sendReply(
          { channel: dest.channel as any, channelUserId: dest.channelUserId, chunks: [text] },
          env,
        );
        await msgs.append(conv.id, "assistant", text).catch(() => {});
        await repo.logInteraction({
          caseId,
          debtorId: debtor.id,
          accountId: acc.account_id,
          channel: dest.channel,
          direction: "out",
          kind: "mensaje",
          summary: text.slice(0, 300),
          outcome: "recordatorio",
        });
        await repo.logAttempt(caseId, debtor.id, dest.channel, "recordatorio");
        await repo.bumpAttempts(caseId);
        await db.run(
          "UPDATE collection_cases SET next_contact_at = ?, stage = CASE WHEN stage = 'nuevo' THEN 'recordatorio' ELSE stage END WHERE id = ?",
          [now + cooldownMs, caseId],
        );
        out.sent++;
      } catch (e) {
        console.error("[collections] recordatorio falló:", e);
        out.failed++;
      }
    }
  }

  // ── Promesas vencidas + recordatorio de promesas próximas ─────────────────
  out.promisesBroken = await repo.markBrokenPromises().catch(() => 0);
  try {
    const due = await repo.promisesDue(24);
    for (const p of due) {
      if (out.promiseReminders >= MAX_PER_RUN) break;
      const dest = await resolveDestination(env, db, p.debtor_phone ?? null);
      if (!dest) continue;
      const caseId = await repo.ensureCase(p.debtor_id).catch(() => null);
      // Guard anti-duplicado: no recordar la misma promesa dos veces en 20h.
      const recent = await db.first<{ n: number }>(
        "SELECT COUNT(*) AS n FROM collection_interactions WHERE debtor_id = ? AND outcome = 'recordatorio_promesa' AND created_at > ?",
        [p.debtor_id, now - cooldownMs],
      );
      if ((recent?.n ?? 0) > 0) continue;
      const text = renderCollectionTemplate(
        "Hola {nombre}, te recordamos la promesa de pago de {monto} para hoy ({vence}). ¡Gracias! — {negocio}",
        {
          nombre: p.debtor_name || "buenas tardes",
          negocio: businessName,
          saldo: fmtMoney(Number(p.amount ?? 0)),
          monto: fmtMoney(Number(p.amount ?? 0)),
          vence: fmtDate(p.promised_date),
          dias: "0",
        },
      );
      try {
        const conv = await convs.getOrCreate(dest.channel, dest.channelUserId, p.debtor_name ?? undefined);
        await pickAdapter(dest.channel as any).sendReply(
          { channel: dest.channel as any, channelUserId: dest.channelUserId, chunks: [text] },
          env,
        );
        await msgs.append(conv.id, "assistant", text).catch(() => {});
        await repo.logInteraction({
          caseId,
          debtorId: p.debtor_id,
          channel: dest.channel,
          direction: "out",
          kind: "mensaje",
          summary: text.slice(0, 300),
          outcome: "recordatorio_promesa",
        });
        out.promiseReminders++;
      } catch (e) {
        console.error("[collections] recordatorio de promesa falló:", e);
        out.failed++;
      }
    }
  } catch (e) {
    console.warn("[collections] promesas:", e);
  }

  return out;
}
