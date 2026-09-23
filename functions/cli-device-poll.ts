// cli-device-poll — el CLI pregunta si su código ya fue aprobado.
// Público (el código es el secreto de un solo uso). Al aprobarse devuelve el
// token de sesión del CLI una única vez y consume el código.
import { createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Kooni-Token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return json({ error: "falta code" }, 400);

  const admin = createAdminClient({ baseUrl: Deno.env.get("INSFORGE_BASE_URL")!, apiKey: Deno.env.get("API_KEY")! });
  const { data: rows } = await admin.database.from("device_codes")
    .select("id, status, session_token, expires_at").eq("code", code);
  const dc = Array.isArray(rows) ? rows[0] : rows;
  if (!dc) return json({ error: "código desconocido" }, 404);

  if (dc.status === "pending" && new Date(dc.expires_at).getTime() < Date.now()) {
    await admin.database.from("device_codes").update({ status: "expired" }).eq("id", dc.id);
    return json({ status: "expired" });
  }
  if (dc.status === "pending") return json({ status: "pending" });
  if (dc.status === "denied") return json({ status: "denied" });
  if (dc.status === "approved") {
    const token = dc.session_token;
    await admin.database.from("device_codes").update({ status: "expired", session_token: null }).eq("id", dc.id);
    return json({ status: "approved", token });
  }
  return json({ status: dc.status });
}
