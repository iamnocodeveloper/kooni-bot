// registrar-uso — el worker empuja su reporte agregado (SIN PII) cada noche.
// Autenticación por token POR INSTALACIÓN (X-Kooni-Token).
import { createAdminClient } from "npm:@insforge/sdk";
import { createHash } from "node:crypto";

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

  const token = (req.headers.get("X-Kooni-Token") || (req.headers.get("Authorization") || "").replace("Bearer ", "")).trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const admin = createAdminClient({ baseUrl: Deno.env.get("INSFORGE_BASE_URL")!, apiKey: Deno.env.get("API_KEY")! });

  const { data: instRows } = await admin.database.from("instalaciones")
    .select("id, user_id, uid").eq("token_hash", hash(token));
  const inst = Array.isArray(instRows) ? instRows[0] : instRows;
  if (!inst) return json({ error: "token desconocido" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const now = new Date().toISOString();

  await admin.database.from("uso_instalaciones").insert([{
    instalacion_id: inst.id,
    user_id: inst.user_id,
    fecha: now.slice(0, 10),
    conteos: body.conteos ?? {},
    costos: body.costos ?? {},
  }]);

  await admin.database.from("instalaciones").update({
    last_seen: now,
    tier: body.tier ?? undefined,
    bot_version: body.botVersion ?? undefined,
    bot_name: body.botName ?? undefined,
    worker_url: body.workerUrl ?? undefined,
  }).eq("id", inst.id);

  return json({ ok: true });
}
