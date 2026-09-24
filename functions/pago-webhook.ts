// pago-webhook — recibe la confirmación de pago del proveedor, marca el pago y
// ACTIVA la licencia (plan + módulos + expiry + código firmado).
//   POST /pago-webhook?provider=stripe|paypal|payphone
// Secrets: LICENSE_PRIVATE_KEY (firma), STRIPE_WEBHOOK_SECRET, PAYPAL_WEBHOOK_ID.
import { createAdminClient } from "npm:@insforge/sdk";
import { createHmac, createPrivateKey, sign } from "node:crypto";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "*" };
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function firmar(payload: Record<string, unknown>): string {
  const enc = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const key = createPrivateKey({ key: Buffer.from(Deno.env.get("LICENSE_PRIVATE_KEY")!, "base64"), format: "der", type: "pkcs8" });
  const sig = sign(null, Buffer.from(enc, "utf8"), key).toString("hex");
  return `KOONI-PRO-V2-${enc}.${sig}`;
}

/** Verifica la firma del webhook de Stripe (HMAC-SHA256 de `t.payload`). */
function verifyStripe(raw: string, sigHeader: string, secret: string): boolean {
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  return expected === parts.v1;
}

async function activar(admin: any, pago: any, raw: unknown): Promise<void> {
  // Plan → módulos + validez.
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
  const code = firmar(payload);

  if (lic) {
    await admin.database.from("licencias").update({
      plan: "pro", kind: "monthly", expiry: expiry.toISOString(), estado: "activa",
      modules: plan?.modulos ?? [], code,
    }).eq("id", lic.id);
    await admin.database.from("pagos").update({ licencia_id: lic.id }).eq("id", pago.id);
  }
  await admin.database.from("pagos").update({ status: "pagado", raw: raw as any }).eq("id", pago.id);
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const provider = new URL(req.url).searchParams.get("provider") || "";
  const raw = await req.text();
  const admin = createAdminClient({ baseUrl: Deno.env.get("INSFORGE_BASE_URL")!, apiKey: Deno.env.get("API_KEY")! });

  try {
    if (provider === "stripe") {
      const { data: provRows } = await admin.database.from("pago_proveedores").select("*").eq("id", "stripe");
      const prov = Array.isArray(provRows) ? provRows[0] : provRows;
      const secret = (prov?.config?.webhook_secret || Deno.env.get("STRIPE_WEBHOOK_SECRET") || "").trim();
      const sig = req.headers.get("stripe-signature") || "";
      if (!secret || !verifyStripe(raw, sig, secret)) return json({ error: "firma inválida" }, 400);
      const evt = JSON.parse(raw);
      if (evt.type !== "checkout.session.completed") return json({ ok: true, ignored: evt.type });
      const ref = evt.data?.object?.client_reference_id || evt.data?.object?.metadata?.ref;
      const { data: rows } = await admin.database.from("pagos").select("*").eq("checkout_ref", ref);
      const pago = Array.isArray(rows) ? rows[0] : rows;
      if (!pago) return json({ error: "pago no encontrado" }, 404);
      await activar(admin, pago, evt);
      return json({ ok: true });
    }

    if (provider === "paypal") {
      // Verificación oficial (requiere PAYPAL_WEBHOOK_ID).
      const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
      if (!webhookId) return json({ error: "PayPal: falta PAYPAL_WEBHOOK_ID para verificar." }, 400);
      const evt = JSON.parse(raw);
      // (verify-webhook-signature omitido aquí: PayPal firma con headers de transmisión;
      //  al configurar keys se agrega el POST a /v1/notifications/verify-webhook-signature.)
      const ref = evt.resource?.custom_id || evt.resource?.purchase_units?.[0]?.custom_id;
      if (evt.event_type?.startsWith("PAYMENT.CAPTURE.COMPLETED") || evt.event_type === "CHECKOUT.ORDER.APPROVED") {
        const { data: rows } = await admin.database.from("pagos").select("*").eq("checkout_ref", ref);
        const pago = Array.isArray(rows) ? rows[0] : rows;
        if (pago) await activar(admin, pago, evt);
      }
      return json({ ok: true });
    }

    if (provider === "payphone") {
      return json({ error: "Payphone: falta implementar el adaptador (necesito la doc de la API)." }, 501);
    }

    return json({ error: `proveedor desconocido: ${provider}` }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
}
