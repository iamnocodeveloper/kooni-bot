import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Instalacion, Licencia } from "../lib/types";

export default function Cuenta() {
  const [lics, setLics] = useState<Licencia[]>([]);
  const [insts, setInsts] = useState<Instalacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [lic, inst] = await Promise.all([
        insforge.database.from("licencias").select("id, plan, kind, expiry, estado, modules, bot_slug, inst_uid").order("created_at", { ascending: false }).limit(50),
        insforge.database.from("instalaciones").select("id, uid, slug, worker_url, bot_name, tier, last_seen, created_at").order("last_seen", { ascending: false }).limit(50),
      ]);
      setLics((lic.data ?? []) as Licencia[]);
      setInsts((inst.data ?? []) as Instalacion[]);
      setLoading(false);
    })();
  }, []);

  const pro = lics.find((l) => l.plan === "pro" && l.estado !== "revocada");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Mi cuenta</h1>
        <p className="text-sm text-muted">Tu plan y tus bots instalados.</p>
      </div>

      <div className="card p-5">
        {loading ? (
          <div className="text-muted">Cargando…</div>
        ) : pro ? (
          <div className="flex items-center gap-3">
            <span className="chip bg-accentSoft text-accent">● PLAN PRO</span>
            <span className="text-sm text-muted">
              {pro.expiry ? `vence el ${new Date(pro.expiry).toLocaleDateString("es")}` : "de por vida"} · {pro.modules?.length ?? 0} módulos activos
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="chip bg-panel2 text-muted">○ PLAN GRATIS</span>
            <span className="text-sm text-muted">Activa Pro para quitar los límites y desbloquear módulos.</span>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Bot</th>
              <th>UID</th>
              <th>Plan</th>
              <th>Último visto</th>
              <th>Panel</th>
            </tr>
          </thead>
          <tbody>
            {insts.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="text-muted">
                  Todavía no tienes bots instalados. Corre <span className="font-mono">npx kooni-bot init</span>.
                </td>
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
                <td>
                  {i.worker_url ? (
                    <a className="text-accent hover:underline" href={`${i.worker_url}/admin`} target="_blank" rel="noreferrer">
                      abrir /admin
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
