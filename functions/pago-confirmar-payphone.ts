// pago-confirmar-payphone — Payphone exige CONFIRMAR la transacción dentro de
// los 5 minutos o la reversa. El hub llama acá tras volver de la Cajita de Pagos.
// Llama a /api/confirm y, si está aprobada, activa la licencia.
import { createAdminClient } from "npm:@insforge/sdk";
import { createPrivateKey, sign } from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Kooni-Token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function firmar(payload: Record<string, unknown>): string {
  const enc = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const key = createPrivateKey({ key: Buffer.from(Deno.env.get("LICENSE_PRIVATE_KEY")!, "base64"), format: "der", type: "pkcs8" });
  const sig = sign(null, Buffer.from(enc, "utf8"), key).toString("hex");
  return `KOONI-PRO-V2-${enc}.${sig}`;
}

async function activar(admin: any, pago: any, raw: unknown): Promise<void> {
  const { data: planRows } = await admin.database.from("planes").select("*").eq("id", pago.plan_id);
  const plan = Array.isArray(planRows) ? planRows[0] : planRows;
  const { data: licRows } = await admin.database.from("licencias")
    .select("*").eq("user_id", pago.user_id).order("created_at", { ascending: false }).limit(1);
  const lic = Array.isArray(licRows) ? licRows[0] : licRows;
  const expiry = new Date(Date.now() + 30 * 86400000);
  const payload: Record<string, unknown> = { kind: "monthly", expiry: expiry.getTime() };
  if (lic?.inst_uid) payload.inst = lic.inst_uid;
  if (lic?.bot_slug) payload.bot = lic.bot_slug;
  if (Array.isArray(plan?.modulos) && plan.modulos.length) payload.modules = plan.modulos;
  if (lic) {
    await admin.database.from("licencias").update({
      plan: "pro", kind: "monthly", expiry: expiry.toISOString(), estado: "activa",
      modules: plan?.modulos ?? [], code: firmar(payload),
    }).eq("id", lic.id);
    await admin.database.from("pagos").update({ licencia_id: lic.id }).eq("id", pago.id);
  }
  await admin.database.from("pagos").update({ status: "pagado", raw: raw as any }).eq("id", pago.id);
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!userToken) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const id = Number(body.id);
  const clientTxId = String(body.clientTxId || "").trim();
  if (!id || !clientTxId) return json({ error: "faltan id o clientTxId" }, 400);

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
  const { data: provRows } = await admin.database.from("pago_proveedores").select("*").eq("id", "payphone");
  const prov = Array.isArray(provRows) ? provRows[0] : provRows;
  const token = (prov?.config?.token || Deno.env.get("PAYPHONE_TOKEN") || "").trim();
  if (!token) return json({ error: "Payphone no está configurado." }, 400);

  const res = await fetch("https://paymentbox.payphonetodoesposible.com/api/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, clientTxId }),
  });
  const det = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: `Payphone confirm: ${det?.message ?? res.status}` }, 400);
  if (Number(det.statusCode) !== 3) return json({ error: `Pago no aprobado (${det.transactionStatus ?? det.statusCode})` }, 400);

  const { data: pagoRows } = await admin.database.from("pagos").select("*").eq("checkout_ref", clientTxId);
  const pago = Array.isArray(pagoRows) ? pagoRows[0] : pagoRows;
  if (!pago) return json({ error: "pago no encontrado" }, 404);
  await activar(admin, pago, det);
  return json({ ok: true });
}
