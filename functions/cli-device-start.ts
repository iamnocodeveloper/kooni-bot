// cli-device-start — primer paso del login del CLI (device flow, estilo Forja).
// Público: devuelve un código corto que el usuario aprueba en el sitio.
import { createAdminClient } from "npm:@insforge/sdk";
import { randomBytes } from "node:crypto";

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

  const admin = createAdminClient({ baseUrl: Deno.env.get("INSFORGE_BASE_URL")!, apiKey: Deno.env.get("API_KEY")! });

  const raw = randomBytes(3).toString("hex").toUpperCase(); // 6 hex
  const code = `${raw.slice(0, 3)}-${raw.slice(3)}`;         // ABC-123
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await admin.database.from("device_codes").insert([{ code, status: "pending", expires_at: expiresAt }]);
  if (error) return json({ error: String((error as any)?.message || error) }, 500);

  const site = Deno.env.get("SITE_URL") || "https://kooni.click";
  return json({ code, verification_url: `${site}/cli?code=${code}`, expires_at: expiresAt });
}
