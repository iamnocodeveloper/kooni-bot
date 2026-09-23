// cli-device-approve — el usuario logueado en el sitio aprueba un código de CLI.
// Autenticado con el JWT del usuario. Emite el token de sesión del CLI (hasheado).
import { createClient, createAdminClient } from "npm:@insforge/sdk";
import { createHash, randomBytes } from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Kooni-Token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

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

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return json({ error: "falta code" }, 400);

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
  const { data: rows } = await admin.database.from("device_codes")
    .select("id, status, expires_at").eq("code", code);
  const dc = Array.isArray(rows) ? rows[0] : rows;
  if (!dc) return json({ error: "código desconocido" }, 404);
  if (dc.status !== "pending") return json({ error: `el código ya está ${dc.status}` }, 409);
  if (new Date(dc.expires_at).getTime() < Date.now()) {
    await admin.database.from("device_codes").update({ status: "expired" }).eq("id", dc.id);
    return json({ error: "el código expiró" }, 410);
  }

  const token = randomBytes(24).toString("hex");
  await admin.database.from("cli_tokens").insert([{ user_id: uid, token_hash: hash(token), label: body.label ?? null }]);
  await admin.database.from("device_codes").update({
    status: "approved", user_id: uid, session_token: token, approved_at: new Date().toISOString(),
  }).eq("id", dc.id);

  return json({ ok: true });
}
