// pago-crear — crea el checkout del plan elegido con el proveedor elegido.
// La config de cada proveedor se toma de `pago_proveedores` (la pone el super
// admin desde el panel); si falta, cae al secret de entorno.
//   Stripe/PayPal → devuelve { url } (redirect)
//   Payphone      → devuelve { widget } (se renderiza client-side)
//   Binance       → devuelve { manual } (pago manual, lo confirma el admin)
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

const ENV_FALLBACK: Record<string, Record<string, string>> = {
  stripe: { secret_key: "STRIPE_SECRET_KEY", webhook_secret: "STRIPE_WEBHOOK_SECRET" },
  paypal: { client_id: "PAYPAL_CLIENT_ID", client_secret: "PAYPAL_CLIENT_SECRET", webhook_id: "PAYPAL_WEBHOOK_ID" },
  payphone: { token: "PAYPHONE_TOKEN", store_id: "PAYPHONE_STORE_ID" },
};

export function cfgValue(prov: any, key: string): string {
  const fromDb = prov?.config?.[key];
  if (typeof fromDb === "string" && fromDb.trim()) return fromDb.trim();
  const envName = ENV_FALLBACK[prov?.id]?.[key];
  return envName ? (Deno.env.get(envName) ?? "").trim() : "";
}

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
  const [{ data: planRows }, { data: provRows }] = await Promise.all([
    admin.database.from("planes").select("*").eq("id", planId),
    admin.database.from("pago_proveedores").select("*").eq("id", provider),
  ]);
  const plan = Array.isArray(planRows) ? planRows[0] : planRows;
  const prov = Array.isArray(provRows) ? provRows[0] : provRows;
  if (!plan) return json({ error: "plan no encontrado" }, 404);
  if (plan.precio == null) return json({ error: "ese plan no tiene precio (es gratis)" }, 400);
  if (!prov) return json({ error: `proveedor desconocido: ${provider}` }, 400);

  const amount = Number(plan.precio);
  const currency = String(plan.moneda || "usd").toUpperCase();
  const ref = randomUUID();

  const { data: ins } = await admin.database.from("pagos").insert([{
    user_id: uid, provider, amount, currency, status: "pendiente", plan_id: planId, checkout_ref: ref,
  }]).select("id");
  const pagoId = (Array.isArray(ins) ? ins[0] : ins)?.id;

  try {
    if (provider === "stripe") {
      const key = cfgValue(prov, "secret_key");
      if (!key) return json({ error: "Stripe no está configurado." }, 400);
      const form = new URLSearchParams({
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
        "line_items[0][price_data][product_data][name]": `Kooni+ · ${plan.nombre}`,
        client_reference_id: ref,
        "metadata[ref]": ref,
        "metadata[plan_id]": planId,
        success_url: `${site()}/plan?pago=ok`,
        cancel_url: `${site()}/plan?pago=cancelado`,
      } as Record<string, string>);
      if (email) form.set("customer_email", email);
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
      const cid = cfgValue(prov, "client_id");
      const secret = cfgValue(prov, "client_secret");
      if (!cid || !secret) return json({ error: "PayPal no está configurado." }, 400);
      const host = prov.modo === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
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
          application_context: { return_url: `${site()}/plan?pago=ok`, cancel_url: `${site()}/plan?pago=cancelado`, user_action: "PAY_NOW" },
        }),
      });
      const ord = await ordRes.json().catch(() => ({}));
      if (!ordRes.ok) return json({ error: `PayPal: ${ord?.message ?? ordRes.status}` }, 400);
      const approve = (ord.links ?? []).find((l: any) => l.rel === "approve")?.href;
      await admin.database.from("pagos").update({ external_id: ord.id, checkout_url: approve }).eq("id", pagoId);
      return json({ url: approve });
    }

    if (provider === "payphone") {
      const token = cfgValue(prov, "token");
      const storeId = cfgValue(prov, "store_id");
      if (!token || !storeId) return json({ error: "Payphone no está configurado." }, 400);
      // Payphone se renderiza client-side (Cajita de Pagos). Devuelve los params.
      return json({
        widget: {
          token,
          storeId,
          clientTransactionId: ref,
          amount: Math.round(amount * 100), // centavos
          amountWithoutTax: Math.round(amount * 100),
          currency,
          reference: `Kooni+ · ${plan.nombre}`,
        },
      });
    }

    if (provider === "binance") {
      // Pago manual: se muestran las instrucciones y el admin confirma.
      return json({
        manual: true,
        ref,
        amount,
        currency,
        pay_id: cfgValue(prov, "pay_id"),
        instructions: prov.config?.instructions ?? "",
      });
    }

    return json({ error: `proveedor desconocido: ${provider}` }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
}
