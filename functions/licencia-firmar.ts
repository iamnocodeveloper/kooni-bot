// licencia-firmar — firma un código KOONI-PRO-V2 (Ed25519). SOLO super admin.
// La clave privada vive como secret (LICENSE_PRIVATE_KEY); nunca sale de aquí.
import { createClient, createAdminClient } from "npm:@insforge/sdk";
import { createPrivateKey, sign } from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Kooni-Token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** Firma un payload con la clave privada del proyecto. Mismo formato que src/license.ts. */
export function firmar(privB64: string, payload: Record<string, unknown>): string {
  const enc = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const key = createPrivateKey({ key: Buffer.from(privB64, "base64"), format: "der", type: "pkcs8" });
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
  const role = Array.isArray(profRows) ? profRows[0]?.role : (profRows as any)?.role;
  if (role !== "admin") return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const payload: Record<string, unknown> = { kind: body.kind === "monthly" ? "monthly" : "lifetime" };
  if (body.expiry) payload.expiry = Number(body.expiry);
  if (body.bot_slug) payload.bot = String(body.bot_slug);
  if (body.inst_uid) payload.inst = String(body.inst_uid);
  if (Array.isArray(body.modules)) payload.modules = body.modules;

  const priv = Deno.env.get("LICENSE_PRIVATE_KEY");
  if (!priv) return json({ error: "LICENSE_PRIVATE_KEY no configurada" }, 500);

  return json({ code: firmar(priv, payload), payload });
}
