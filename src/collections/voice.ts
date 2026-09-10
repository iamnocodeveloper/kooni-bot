// Cobranza por voz (nicho `cartera`): dispara la llamada con Vapi o Retell y
// registra el resultado que llega por webhook en la cartera (interacción +
// etapa del caso). La configuración vive en Conexiones → "Cobros por voz"
// (ver src/integrations/voiceProviders.ts).
import type { Env } from "../env";
import { Db } from "../db/client";
import { CollectionsRepo, normalizePhone } from "../db/collections";
import { resolveVoiceConfig, voiceConfigured } from "../integrations/voiceProviders";

export interface CallResult {
  ok: boolean;
  provider?: "vapi" | "retell";
  callId?: string;
  error?: string;
}

/** Dispara una llamada de cobranza al deudor con el proveedor activo. */
export async function startDebtorCall(env: Env, debtorId: string, caseId?: string | null): Promise<CallResult> {
  const db = new Db(env.DB);
  const repo = new CollectionsRepo(db);
  const cfg = await resolveVoiceConfig(env);
  if (!voiceConfigured(cfg)) {
    return { ok: false, error: "Configurá Vapi o Retell en Conexiones → Cobros por voz (falta API key / assistant / número)." };
  }
  const debtor = await repo.getDebtor(debtorId);
  if (!debtor) return { ok: false, error: "Deudor no encontrado." };
  const number = normalizePhone(debtor.phone);
  if (number.length < 8) return { ok: false, error: "El deudor no tiene un teléfono válido." };

  const resolvedCase = caseId ?? (await repo.ensureCase(debtorId).catch(() => null));
  const metadata = {
    source: "kooni",
    debtorId,
    caseId: resolvedCase,
    debtorName: debtor.name ?? undefined,
    balance: debtor.balance,
  };

  try {
    if (cfg.provider === "vapi") {
      const res = await fetch(`${cfg.vapi.baseUrl.replace(/\/+$/, "")}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.vapi.apiKey}` },
        body: JSON.stringify({
          assistantId: cfg.vapi.assistantId,
          phoneNumberId: cfg.vapi.phoneNumberId,
          customer: { number: `+${number}` },
          metadata,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, error: `Vapi respondió ${res.status}: ${j?.message ?? ""}`.slice(0, 200) };
      await repo.logInteraction({
        caseId: resolvedCase,
        debtorId,
        channel: "voz",
        direction: "out",
        kind: "llamada",
        summary: `Llamada de cobranza iniciada (Vapi)`,
        outcome: "programada",
        payload: { callId: j?.id, provider: "vapi" },
      });
      await repo.bumpAttempts(resolvedCase!).catch(() => {});
      return { ok: true, provider: "vapi", callId: j?.id };
    }

    // Retell
    const res = await fetch(`${cfg.retell.baseUrl.replace(/\/+$/, "")}/v2/create-phone-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.retell.apiKey}` },
      body: JSON.stringify({
        from_number: cfg.retell.phoneNumber || undefined,
        to_number: `+${number}`,
        override_agent_id: cfg.retell.agentId,
        metadata,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => ({}))) as { call_id?: string; message?: string };
    if (!res.ok) return { ok: false, error: `Retell respondió ${res.status}: ${j?.message ?? ""}`.slice(0, 200) };
    await repo.logInteraction({
      caseId: resolvedCase,
      debtorId,
      channel: "voz",
      direction: "out",
      kind: "llamada",
      summary: `Llamada de cobranza iniciada (Retell)`,
      outcome: "programada",
      payload: { callId: j?.call_id, provider: "retell" },
    });
    await repo.bumpAttempts(resolvedCase!).catch(() => {});
    return { ok: true, provider: "retell", callId: j?.call_id };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

/** Traduce el texto del análisis de la llamada a un `outcome` de la cartera. */
export function outcomeFromCallText(text: string, endedReason?: string): string {
  const t = `${text} ${endedReason ?? ""}`.toLowerCase();
  if (/promet|promes|acuerd|compromet|va a pagar|pag(a|ar[aá]) el|pagar[aá] (el|hoy|ma[nñ]ana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/.test(t)) return "promesa";
  if (/ya pag|realiz[oó] el pago|pagado/.test(t)) return "pago";
  if (/disput|no reconoce|no debe|reclama/.test(t)) return "disputa";
  if (/no contesta|sin respuesta|buz[oó]n|voicemail|no disponible|colg[oó]|did-not-answer|not-answer|no-answer|no_answer|busy|machine|silence/.test(t)) return "sin_respuesta";
  if (/n[uú]mero inv[aá]lido|no existe/.test(t)) return "numero_invalido";
  if (/contact|habl[oó]|convers/.test(t)) return "contactado";
  return "contactado";
}

/**
 * Procesa el webhook de Vapi/Retell: registra el resultado de la llamada en la
 * cartera (interacción + etapa) y, si hubo promesa, la deja anotada.
 */
export async function handleVoiceWebhook(
  env: Env,
  provider: "vapi" | "retell",
  body: any,
): Promise<{ handled: boolean; debtorId?: string; outcome?: string }> {
  let call: any = null;
  let summary = "";
  let endedReason = "";
  let callId = "";

  if (provider === "vapi") {
    const type = body?.message?.type;
    if (type !== "end-of-call-report" && type !== "status-update") return { handled: false };
    call = body?.message?.call ?? {};
    summary = String(body?.message?.analysis?.summary ?? body?.message?.summary ?? body?.message?.artifact?.transcript ?? "");
    endedReason = String(body?.message?.endedReason ?? "");
    callId = String(call?.id ?? "");
  } else {
    const event = body?.event;
    if (event !== "call_analyzed" && event !== "call_ended") return { handled: false };
    call = body?.call ?? body?.data?.call ?? {};
    summary = String(call?.call_analysis?.call_summary ?? body?.call_analysis?.call_summary ?? "");
    endedReason = String(call?.disconnection_reason ?? "");
    callId = String(call?.call_id ?? "");
  }

  const debtorId = call?.metadata?.debtorId;
  const caseId = call?.metadata?.caseId ?? null;
  if (!debtorId) return { handled: false };

  const db = new Db(env.DB);
  const repo = new CollectionsRepo(db);
  const outcome = outcomeFromCallText(summary, endedReason);

  await repo.logInteraction({
    caseId,
    debtorId,
    channel: "voz",
    direction: "out",
    kind: "llamada",
    summary: (summary || `Llamada finalizada (${endedReason || "sin detalle"})`).slice(0, 400),
    outcome,
    payload: { provider, callId, endedReason },
  });
  await repo.logAttempt(caseId, debtorId, "voz", outcome).catch(() => {});

  // Etapa según el resultado.
  const stage =
    outcome === "pago" ? "pagado" : outcome === "promesa" ? "promesa" : outcome === "disputa" ? "escalado" : outcome === "contactado" ? "negociacion" : null;
  if (caseId && stage) await repo.setCaseStage(caseId, stage).catch(() => {});
  if (outcome === "pago") {
    const accounts = await repo.listAccounts(debtorId).catch(() => []);
    for (const a of accounts) {
      if (a.status === "open" || a.status === "promise") await repo.setAccountStatus(a.id, "paid").catch(() => {});
    }
  }

  return { handled: true, debtorId, outcome };
}
