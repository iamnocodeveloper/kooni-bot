// pago-crear — crea un checkout del plan elegido con el proveedor elegido y
// devuelve la URL de pago. El secreto de cada proveedor vive como secret:
//   Stripe   → STRIPE_SECRET_KEY
//   PayPal   → PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET (+ PAYPAL_ENV=sandbox|live)
//   Payphone → PAYPHONE_TOKEN + PAYPHONE_STORE_ID  (adaptador: ver nota abajo)
// Si el proveedor no está configurado, devuelve un error claro (la UI lo deshabilita).
import { createClient, createAdminClient } from "npm:@insforge/sdk";
import { randomUUID } from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Kooni-Token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const site = () => (Deno.env.get("SITE_URL") || "https://t6bferet.insforge.site").replace(/\/+$/, "");

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!userToken) return json({ error: "unauthorized" }, 401);

  const client = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await client.auth.getCurrentUser();
  const uid = (userData as any)?.user?.id;
  const email = (userData as any)?.user?.email;
  if (!uid) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const planId = String(body.plan_id || "").trim();
  const provider = String(body.provider || "").trim().toLowerCase();
  if (!planId || !provider) return json({ error: "faltan plan_id o provider" }, 400);

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
  const { data: planRows } = await admin.database.from("planes").select("*").eq("id", planId);
  const plan = Array.isArray(planRows) ? planRows[0] : planRows;
  if (!plan) return json({ error: "plan no encontrado" }, 404);
  if (plan.precio == null) return json({ error: "ese plan no tiene precio (es gratis)" }, 400);

  const amount = Number(plan.precio);
  const currency = String(plan.moneda || "usd").toUpperCase();
  const ref = randomUUID();

  // Fila pendiente (la marca el webhook).
  const { data: ins } = await admin.database.from("pagos").insert([{
    user_id: uid, provider, amount, currency, status: "pendiente", plan_id: planId, checkout_ref: ref,
  }]).select("id");
  const pagoId = (Array.isArray(ins) ? ins[0] : ins)?.id;

  try {
    if (provider === "stripe") {
      const key = Deno.env.get("STRIPE_SECRET_KEY");
      if (!key) return json({ error: "Stripe no está configurado (falta STRIPE_SECRET_KEY)." }, 400);
      const form = new URLSearchParams({
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
        "line_items[0][price_data][product_data][name]": `Kooni+ · ${plan.nombre}`,
        client_reference_id: ref,
        "metadata[ref]": ref,
        "metadata[plan_id]": planId,
        customer_email: email ?? undefined,
        success_url: `${site()}/?pago=ok`,
        cancel_url: `${site()}/?pago=cancelado`,
      } as Record<string, string>);
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: `Stripe: ${j?.error?.message ?? res.status}` }, 400);
      await admin.database.from("pagos").update({ external_id: j.id, checkout_url: j.url }).eq("id", pagoId);
      return json({ url: j.url });
    }

    if (provider === "paypal") {
      const cid = Deno.env.get("PAYPAL_CLIENT_ID");
      const secret = Deno.env.get("PAYPAL_CLIENT_SECRET");
      if (!cid || !secret) return json({ error: "PayPal no está configurado (faltan PAYPAL_CLIENT_ID/SECRET)." }, 400);
      const host = Deno.env.get("PAYPAL_ENV") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const tokRes = await fetch(`${host}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${cid}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok || !tok.access_token) return json({ error: "PayPal: no pude autenticar." }, 400);
      const ordRes = await fetch(`${host}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ custom_id: ref, amount: { currency_code: currency, value: amount.toFixed(2) }, description: `Kooni+ · ${plan.nombre}` }],
          application_context: { return_url: `${site()}/?pago=ok`, cancel_url: `${site()}/?pago=cancelado`, user_action: "PAY_NOW" },
        }),
      });
      const ord = await ordRes.json().catch(() => ({}));
      if (!ordRes.ok) return json({ error: `PayPal: ${ord?.message ?? ordRes.status}` }, 400);
      const approve = (ord.links ?? []).find((l: any) => l.rel === "approve")?.href;
      await admin.database.from("pagos").update({ external_id: ord.id, checkout_url: approve }).eq("id", pagoId);
      return json({ url: approve });
    }

    if (provider === "payphone") {
      // PENDIENTE: falta la documentación de la API de Payphone para el adaptador.
      const token = Deno.env.get("PAYPHONE_TOKEN");
      const storeId = Deno.env.get("PAYPHONE_STORE_ID");
      if (!token || !storeId) return json({ error: "Payphone no está configurado (faltan PAYPHONE_TOKEN/PAYPHONE_STORE_ID)." }, 400);
      return json({ error: "Payphone: falta implementar el adaptador (necesito la doc de la API)." }, 501);
    }

    return json({ error: `proveedor desconocido: ${provider}` }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
}
