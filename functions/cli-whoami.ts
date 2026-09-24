// cli-whoami — devuelve la cuenta a la que pertenece un token de CLI.
// Lo usa `kooni-bot whoami` para confirmar con qué cuenta está conectado.
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
  const { data: rows } = await admin.database.from("cli_tokens").select("user_id, label, created_at").eq("token_hash", hash(token));
  const tok = Array.isArray(rows) ? rows[0] : rows;
  if (!tok) return json({ error: "token desconocido" }, 401);

  const { data: profRows } = await admin.database.from("profiles").select("email, role").eq("id", tok.user_id);
  const prof = Array.isArray(profRows) ? profRows[0] : profRows;

  return json({ email: prof?.email ?? null, role: prof?.role ?? "cliente", label: tok.label ?? null });
}
