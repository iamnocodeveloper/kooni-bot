// pago-proveedores — dice qué proveedores de pago están configurados (solo admin).
// Así el panel muestra "listo" / "falta configurar" sin exponer los secretos.
import { createClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Kooni-Token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!userToken) return json({ error: "unauthorized" }, 401);
  const client = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await client.auth.getCurrentUser();
  const uid = (userData as any)?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);

  const providers = [
    {
      id: "stripe",
      nombre: "Stripe",
      listo: Boolean(Deno.env.get("STRIPE_SECRET_KEY") && Deno.env.get("STRIPE_WEBHOOK_SECRET")),
      faltan: [
        !Deno.env.get("STRIPE_SECRET_KEY") && "STRIPE_SECRET_KEY",
        !Deno.env.get("STRIPE_WEBHOOK_SECRET") && "STRIPE_WEBHOOK_SECRET",
      ].filter(Boolean),
    },
    {
      id: "paypal",
      nombre: "PayPal",
      listo: Boolean(Deno.env.get("PAYPAL_CLIENT_ID") && Deno.env.get("PAYPAL_CLIENT_SECRET")),
      faltan: [
        !Deno.env.get("PAYPAL_CLIENT_ID") && "PAYPAL_CLIENT_ID",
        !Deno.env.get("PAYPAL_CLIENT_SECRET") && "PAYPAL_CLIENT_SECRET",
        !Deno.env.get("PAYPAL_WEBHOOK_ID") && "PAYPAL_WEBHOOK_ID",
      ].filter(Boolean),
    },
    {
      id: "payphone",
      nombre: "Payphone",
      listo: false,
      faltan: ["PAYPHONE_TOKEN", "PAYPHONE_STORE_ID", "adaptador (falta doc)"],
    },
  ];

  return json({ providers });
}
