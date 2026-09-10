// Tools del nicho "cartera de cobros" (BOT_NICHE=cartera).
//
// - consultarDeuda: saldo REAL del deudor (nunca inventar montos).
// - registrarPromesa: deja registrada una promesa de pago (fecha + monto) y
//   mueve la gestión a la etapa `promesa`.
//
// El deudor se resuelve por: teléfono del chat (la conversación actual), el
// `referencia`/`documento` que dé el cliente, o el teléfono que pase el modelo.
import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { CollectionsRepo, type DebtorRow } from "../db/collections";

function parseDay(s: string | null | undefined): number | null {
  const v = (s ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isFinite(t) ? t : null;
}

/** Resuelve el deudor del chat actual (o por teléfono/referencia). */
async function resolveDebtor(
  env: Env,
  getConversationId: () => string | null,
  opts: { telefono?: string; referencia?: string } = {},
): Promise<DebtorRow | null> {
  const db = new Db(env.DB);
  const repo = new CollectionsRepo(db);
  if (opts.referencia) {
    const byRef = await repo.getDebtorByRef(opts.referencia);
    if (byRef) return byRef;
  }
  if (opts.telefono) {
    const byPhone = await repo.getDebtorByPhone(opts.telefono);
    if (byPhone) return byPhone;
  }
  const convId = getConversationId();
  if (convId) {
    const row = await db.first<{ channel_user_id: string }>(
      "SELECT channel_user_id FROM conversations WHERE id = ?",
      [convId],
    );
    if (row?.channel_user_id) {
      const byChat = await repo.getDebtorByPhone(row.channel_user_id);
      if (byChat) return byChat;
    }
  }
  return null;
}

export function consultarDeudaTool(env: Env, getConversationId: () => string | null) {
  return tool({
    description:
      "Consulta el saldo REAL del deudor en la cartera de cobros (deuda, vencimientos y promesas). " +
      "Usala SIEMPRE antes de dar cualquier monto; nunca inventes cifras. Si no encuentra deudor, " +
      "pedí la referencia o el documento — no supongas que debe.",
    inputSchema: z.object({
      referencia: z.string().optional().describe("Referencia/código del cliente en la cartera"),
      telefono: z.string().optional().describe("Teléfono del deudor (si no es el del chat actual)"),
    }),
    execute: async ({ referencia, telefono }) => {
      const debtor = await resolveDebtor(env, getConversationId, { referencia, telefono });
      if (!debtor) {
        return {
          encontrado: false,
          mensaje:
            "No encontré una deuda asociada a este contacto. Pedí la referencia o el documento; no afirmes que debe.",
        };
      }
      const repo = new CollectionsRepo(new Db(env.DB));
      const accounts = await repo.listAccounts(debtor.id);
      const promises = await repo.listPromises(debtor.id);
      return {
        encontrado: true,
        deudor: { nombre: debtor.name, telefono: debtor.phone },
        saldoTotal: debtor.balance,
        vencimientoProximo: debtor.next_due,
        etapa: debtor.stage,
        cuentas: accounts.map((a) => ({
          concepto: a.concept,
          monto: a.amount,
          pagado: a.paid,
          saldo: Number(a.amount) - Number(a.paid),
          vence: a.due_date,
          estado: a.status,
        })),
        promesas: promises.map((p) => ({ monto: p.amount, fecha: p.promised_date, estado: p.status })),
        instruccion:
          "Da el saldo EXACTO en el tono del negocio. Ofrecé opciones (pago total, parcial o plan) y los medios de pago de la KB. Nunca amenaces.",
      };
    },
  });
}

export function llamarDeudorTool(env: Env, getConversationId: () => string | null) {
  return tool({
    description:
      "Inicia una LLAMADA de cobranza con voz IA (Vapi/Retell) al deudor de este chat. " +
      "Usala solo si el cliente pide que lo llamen o si el negocio lo indicó; no la uses para " +
      "insistir a quien pidió no ser contactado. Requiere Vapi/Retell configurado.",
    inputSchema: z.object({
      referencia: z.string().optional().describe("Referencia/código del cliente en la cartera"),
      telefono: z.string().optional().describe("Teléfono (si no es el del chat actual)"),
    }),
    execute: async ({ referencia, telefono }) => {
      const debtor = await resolveDebtor(env, getConversationId, { referencia, telefono });
      if (!debtor) return { ok: false, mensaje: "No encontré al deudor. Pedí la referencia o el documento." };
      const { startDebtorCall } = await import("../collections/voice");
      const r = await startDebtorCall(env, debtor.id);
      if (!r.ok) return { ok: false, mensaje: r.error ?? "No se pudo iniciar la llamada." };
      return {
        ok: true,
        proveedor: r.provider,
        mensaje: "Llamada iniciada. Avisale al cliente que recibirá la llamada en breve.",
      };
    },
  });
}

export function registrarPromesaTool(env: Env, getConversationId: () => string | null) {
  return tool({
    description:
      "Registra una PROMESA DE PAGO del deudor (monto + fecha). Usala cuando el cliente se compromete a pagar. " +
      "Deja la gestión en etapa 'promesa' y avisa al equipo. Requiere monto y fecha (YYYY-MM-DD).",
    inputSchema: z.object({
      monto: z.number().describe("Monto prometido"),
      fecha: z.string().describe("Fecha prometida en formato YYYY-MM-DD"),
      referencia: z.string().optional().describe("Referencia/código del cliente en la cartera"),
      telefono: z.string().optional().describe("Teléfono del deudor (si no es el del chat actual)"),
      nota: z.string().optional().describe("Detalle o acuerdo adicional"),
    }),
    execute: async ({ monto, fecha, referencia, telefono, nota }) => {
      const promisedDate = parseDay(fecha);
      if (!promisedDate) {
        return { ok: false, mensaje: "Fecha inválida: usá el formato YYYY-MM-DD." };
      }
      const debtor = await resolveDebtor(env, getConversationId, { referencia, telefono });
      if (!debtor) {
        return { ok: false, mensaje: "No encontré al deudor. Pedí la referencia o el documento." };
      }
      const repo = new CollectionsRepo(new Db(env.DB));
      await repo.createPromise({ debtorId: debtor.id, amount: monto, promisedDate, notes: nota });
      const caseId = await repo.ensureCase(debtor.id).catch(() => null);
      if (caseId) await repo.setCaseStage(caseId, "promesa").catch(() => {});
      await repo.logInteraction({
        caseId,
        debtorId: debtor.id,
        channel: "whatsapp",
        direction: "in",
        kind: "nota",
        summary: `Promesa de pago: ${monto} para ${fecha}${nota ? ` — ${nota}` : ""}`,
        outcome: "promesa",
      });
      return {
        ok: true,
        deudor: { nombre: debtor.name, telefono: debtor.phone },
        mensaje: `Promesa registrada: ${monto} para ${fecha}. Confirmá con el cliente y avisale que el equipo la verá.`,
      };
    },
  });
}
