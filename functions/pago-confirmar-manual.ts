// pago-confirmar-manual — el super admin marca un pago como recibido (ej. Binance
// manual) y se activa la licencia igual que con un webhook.
import { createClient, createAdminClient } from "npm:@insforge/sdk";
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

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!userToken) return json({ error: "unauthorized" }, 401);
  const client = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await client.auth.getCurrentUser();
  const uid = (userData as any)?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
  const { data: profRows } = await admin.database.from("profiles").select("role").eq("id", uid);
  if ((Array.isArray(profRows) ? profRows[0] : profRows)?.role !== "admin") return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const pagoId = String(body.pago_id || "").trim();
  if (!pagoId) return json({ error: "falta pago_id" }, 400);

  const { data: pagoRows } = await admin.database.from("pagos").select("*").eq("id", pagoId);
  const pago = Array.isArray(pagoRows) ? pagoRows[0] : pagoRows;
  if (!pago) return json({ error: "pago no encontrado" }, 404);
  if (pago.status === "pagado") return json({ ok: true, already: true });

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
  await admin.database.from("pagos").update({ status: "pagado" }).eq("id", pago.id);
  return json({ ok: true });
}
