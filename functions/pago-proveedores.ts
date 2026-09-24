// pago-proveedores — estado de los proveedores de pago (lectura).
// Devuelve qué está configurado (sin exponer secretos salvo el token público
// de Payphone, que su Cajita de Pagos necesita en el navegador).
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
  if (!(userData as any)?.user?.id) return json({ error: "unauthorized" }, 401);

  const { createAdminClient } = await import("npm:@insforge/sdk");
  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
  const { data: rows } = await admin.database.from("pago_proveedores").select("*").order("orden", { ascending: true });
  const provs = (rows ?? []) as any[];

  const val = (p: any, k: string) => (typeof p?.config?.[k] === "string" ? p.config[k].trim() : "");
  const ENV: Record<string, Record<string, string>> = {
    stripe: { secret_key: "STRIPE_SECRET_KEY", webhook_secret: "STRIPE_WEBHOOK_SECRET" },
    paypal: { client_id: "PAYPAL_CLIENT_ID", client_secret: "PAYPAL_CLIENT_SECRET" },
    payphone: { token: "PAYPHONE_TOKEN", store_id: "PAYPHONE_STORE_ID" },
  };
  const v = (p: any, k: string) => val(p, k) || (ENV[p.id]?.[k] ? (Deno.env.get(ENV[p.id][k]) ?? "").trim() : "");

  const providers = provs.map((p) => {
    let listo = false;
    const faltan: string[] = [];
    if (p.id === "stripe") {
      if (!v(p, "secret_key")) faltan.push("secret_key");
      if (!v(p, "webhook_secret")) faltan.push("webhook_secret");
    } else if (p.id === "paypal") {
      if (!v(p, "client_id")) faltan.push("client_id");
      if (!v(p, "client_secret")) faltan.push("client_secret");
    } else if (p.id === "payphone") {
      if (!v(p, "token")) faltan.push("token");
      if (!v(p, "store_id")) faltan.push("store_id");
    } else if (p.id === "binance") {
      if (!v(p, "pay_id") && !(typeof p.config?.instructions === "string" && p.config.instructions.trim())) faltan.push("pay_id");
    }
    listo = p.activo && faltan.length === 0;
    const out: Record<string, unknown> = { id: p.id, nombre: p.nombre, modo: p.modo, activo: p.activo, listo, faltan };
    // Payphone necesita su token/storeId en el navegador para renderizar la Cajita.
    if (p.id === "payphone") out.widget = { token: v(p, "token"), storeId: v(p, "store_id") };
    if (p.id === "binance") out.manual = { pay_id: v(p, "pay_id"), instructions: p.config?.instructions ?? "" };
    return out;
  });

  return json({ providers });
}
