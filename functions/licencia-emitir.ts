// licencia-emitir — el CLI (ya logueado) registra la instalación y recibe su
// token POR INSTALACIÓN + el estado actual de su licencia.
// Auth: JWT del usuario (login web) o token de CLI (device flow).
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

/** Resuelve el usuario desde un JWT (login web) o desde un token de CLI. */
async function resolveUser(req: Request, baseUrl: string, admin: any): Promise<string | null> {
  const token = (req.headers.get("X-Kooni-Token") || (req.headers.get("Authorization") || "").replace("Bearer ", "")).trim();
  if (!token) return null;
  if (token.startsWith("eyJ")) {
    const client = createClient({ baseUrl, accessToken: token });
    const { data } = await client.auth.getCurrentUser();
    return (data as any)?.user?.id ?? null;
  }
  const { data: rows } = await admin.database.from("cli_tokens").select("user_id").eq("token_hash", hash(token));
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.user_id ?? null;
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get("API_KEY")! });

  const uid = await resolveUser(req, baseUrl, admin);
  if (!uid) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const instUid = String(body.uid || "").trim();
  if (!instUid) return json({ error: "falta uid de instalación" }, 400);

  // La instalación pertenece al usuario; si el uid ya es de otro, se rechaza.
  const { data: existingRows } = await admin.database.from("instalaciones").select("id, user_id").eq("uid", instUid);
  const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
  if (existing && existing.user_id !== uid) return json({ error: "esa instalación pertenece a otra cuenta" }, 409);

  const token = randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  const instPayload = {
    user_id: uid,
    uid: instUid,
    slug: body.slug ?? null,
    bot_name: body.bot_name ?? null,
    db_name: body.db_name ?? null,
    kb_name: body.kb_name ?? null,
    worker_url: body.worker_url ?? null,
    provider: body.provider ?? null,
    platform: body.platform ?? null,
    cli_version: body.cli_version ?? null,
    token_hash: hash(token),
    last_seen: now,
  };
  let instId: string;
  if (existing) {
    await admin.database.from("instalaciones").update(instPayload).eq("id", existing.id);
    instId = existing.id;
  } else {
    const { data: ins } = await admin.database.from("instalaciones").insert([instPayload]).select("id");
    instId = (Array.isArray(ins) ? ins[0] : ins)?.id;
  }

  // Licencia free por defecto si no existe.
  let { data: licRows } = await admin.database.from("licencias").select("*").eq("user_id", uid).eq("inst_uid", instUid);
  let lic = Array.isArray(licRows) ? licRows[0] : licRows;
  if (!lic) {
    const { data: created } = await admin.database.from("licencias").insert([{
      user_id: uid, plan: "free", estado: "activa", inst_uid: instUid, bot_slug: body.slug ?? null, modules: [], limits: {}, brand: {},
    }]).select("*");
    lic = Array.isArray(created) ? created[0] : created;
  }
  if (lic && !existing) {
    await admin.database.from("instalaciones").update({ licencia_id: lic.id }).eq("id", instId);
  }

  const revoked = lic?.estado === "revocada";
  const expired = lic?.expiry ? new Date(lic.expiry).getTime() < Date.now() : false;
  const plan = !revoked && !expired && lic?.plan === "pro" ? "pro" : "free";

  return json({
    inst_token: token,
    plan,
    estado: revoked ? "revocada" : expired ? "vencida" : "activa",
    code: plan === "pro" ? (lic?.code ?? null) : null,
    modules: lic?.modules ?? [],
    limits: lic?.limits ?? {},
    brand: lic?.brand ?? {},
  });
}
