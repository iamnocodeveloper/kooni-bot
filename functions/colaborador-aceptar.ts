// colaborador-aceptar — el invitado acepta su invitación de equipo de agencia.
// Verifica que el correo logueado sea el invitado y lo activa.
import { createClient, createAdminClient } from "npm:@insforge/sdk";

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

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const userToken = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!userToken) return json({ error: "unauthorized" }, 401);

  const client = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await client.auth.getCurrentUser();
  const user = (userData as any)?.user;
  const uid = user?.id;
  const email = user?.email;
  if (!uid || !email) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const token = String(body.token || "").trim();
  if (!token) return json({ error: "falta el token de invitación" }, 400);

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });
  const { data: rows } = await admin.database
    .from("colaboradores_cuenta")
    .select("id, email, estado, owner_id")
    .eq("token", token);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return json({ error: "invitación no encontrada" }, 404);
  if (row.estado === "revocado") return json({ error: "esta invitación fue revocada" }, 409);
  if (String(row.email).toLowerCase() !== String(email).toLowerCase()) {
    return json({ error: `esta invitación es para ${row.email}. Entrá con ese correo.` }, 403);
  }

  await admin.database.from("colaboradores_cuenta").update({
    user_id: uid,
    estado: "activo",
    accepted_at: new Date().toISOString(),
  }).eq("id", row.id);

  return json({ ok: true });
}
