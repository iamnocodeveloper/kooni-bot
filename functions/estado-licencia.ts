// estado-licencia — el worker del bot pide su estado real (plan, módulos,
// límites, marca blanca) autenticándose con el token POR INSTALACIÓN.
// Fail-open del lado del bot: si esto no responde, conserva lo último que sabía.
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
    .select("id, user_id, licencia_id, tier, licencia_id").eq("token_hash", hash(token));
  const inst = Array.isArray(instRows) ? instRows[0] : instRows;
  if (!inst) return json({ error: "token desconocido" }, 401);

  let lic: any = null;
  if (inst.licencia_id) {
    const { data: licRows } = await admin.database.from("licencias")
      .select("code, plan, kind, expiry, estado, modules, limits, brand").eq("id", inst.licencia_id);
    lic = Array.isArray(licRows) ? licRows[0] : licRows;
  }

  await admin.database.from("instalaciones")
    .update({ last_seen: new Date().toISOString() }).eq("id", inst.id);

  const revoked = lic?.estado === "revocada";
  const expired = lic?.expiry ? new Date(lic.expiry).getTime() < Date.now() : false;
  const plan = !revoked && !expired && lic?.plan === "pro" ? "pro" : "free";

  return json({
    plan,
    estado: revoked ? "revocada" : expired ? "vencida" : "activa",
    code: plan === "pro" ? (lic?.code ?? null) : null,
    modules: lic?.modules ?? [],
    limits: lic?.limits ?? {},
    brand: lic?.brand ?? {},
    expiry: lic?.expiry ?? null,
  });
}
