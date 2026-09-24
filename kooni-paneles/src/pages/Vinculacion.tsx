import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";
import type { Instalacion } from "../lib/types";

export default function Vinculacion() {
  const { profile } = useAuth();
  const [insts, setInsts] = useState<Instalacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await insforge.database
        .from("instalaciones")
        .select("id, user_id, uid, slug, worker_url, bot_name, tier, last_seen, created_at")
        .order("last_seen", { ascending: false })
        .limit(50);
      setInsts((data ?? []) as Instalacion[]);
      setLoading(false);
    })();
  }, []);

  const email = profile?.email ?? "tu@correo.com";
  const prompt = `Quiero revisar y vincular mi bot de Kooni a mi cuenta (${email}) para que aparezca en mi panel. Hacelo vos, paso a paso, y decime qué ves en cada paso:

1. Entrá a la carpeta del bot (la que creó «npx kooni-bot init»).
2. Revisá el bot con «npx kooni-bot doctor» y arreglá lo que falte.
3. Corré «npx kooni-bot whoami»: debe decir que estoy conectado como ${email}. Si dice otra cuenta o que no hay sesión, corré «npx kooni-bot login» y dejame entrar en el navegador.
4. Corré «npx kooni-bot pair». Debe terminar en «bot conectado».
5. Confirmá con «npx kooni-bot doctor».
6. Si algo falla, pegame el error completo en lugar de intentar otra cosa.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloqueado */
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Vinculación</h1>
        <p className="text-sm text-muted">
          Solo los bots de esta lista aparecen en tu panel. Si el tuyo no está, no está vinculado.
        </p>
      </div>

      <div className="card p-5">
        <div className="text-sm">
          <span className="text-muted">Cuenta: </span>
          <span className="font-mono">{email}</span>
        </div>
        <div className="mt-3 text-sm text-muted">
          Un bot desplegado en tu Cloudflare <b className="text-cream">no se conecta solo</b>: hay que vincularlo
          una vez desde su carpeta.
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Vinculá tu bot</div>
            <p className="text-sm text-muted">Copiá este prompt y pegáselo a tu agente (Claude Code / Codex) en la carpeta del bot.</p>
          </div>
          <button className="btn-ghost shrink-0 text-xs" onClick={copy}>
            {copied ? "✓ Copiado" : "Copiar prompt"}
          </button>
        </div>
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-line bg-panel2 p-3 font-mono text-[11.5px] leading-relaxed text-muted">
          {prompt}
        </pre>
        <p className="mt-2 text-[11.5px] text-muted">
          ¿Preferís a mano? En la carpeta del bot: <code className="text-accent">npx kooni-bot pair</code>
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Bot vinculado</th>
              <th>UID</th>
              <th>Plan</th>
              <th>Último visto</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-muted">Cargando…</td>
              </tr>
            )}
            {!loading && insts.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted">Ningún bot vinculado a esta cuenta.</td>
              </tr>
            )}
            {insts.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="font-medium">{i.bot_name ?? i.slug ?? "—"}</div>
                  <div className="text-[11px] text-muted">{i.slug}</div>
                </td>
                <td className="font-mono text-[11px] text-muted">{i.uid}</td>
                <td>
                  <span className={`chip ${i.tier === "pro" ? "bg-accentSoft text-accent" : "bg-panel2 text-muted"}`}>{i.tier ?? "free"}</span>
                </td>
                <td className="text-muted">{i.last_seen ? new Date(i.last_seen).toLocaleDateString("es") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
