import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Instalacion, Profile } from "../lib/types";

export default function AdminRevendedores() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [insts, setInsts] = useState<Instalacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const [pr, inst] = await Promise.all([
      insforge.database.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
      insforge.database.from("instalaciones").select("id, user_id, uid, slug, bot_name, tier").limit(1000),
    ]);
    setProfiles((pr.data ?? []) as Profile[]);
    setInsts((inst.data ?? []) as Instalacion[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function setRole(id: string, role: string) {
    const { error } = await insforge.database.from("profiles").update({ role }).eq("id", id);
    if (error) setErr((error as any).message);
    await load();
  }

  const resellers = profiles.filter((p) => p.role === "revendedor");
  const botsDe = (id: string) => insts.filter((i) => i.user_id === id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Revendedores</h1>
        <p className="text-sm text-muted">
          Cuentas marcadas como revendedor (agencias). Promové a alguien desde <b className="text-cream">Clientes</b> (rol
          revendedor). Acá ves su cartera y podés devolverlos a cliente.
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}

      {loading ? (
        <div className="text-muted">Cargando…</div>
      ) : resellers.length === 0 ? (
        <div className="card p-6 text-sm text-muted">
          Todavía no hay revendedores. En <b className="text-cream">Clientes</b> cambiá el rol de una cuenta a «revendedor».
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {resellers.map((r) => {
            const bots = botsDe(r.id);
            return (
              <div key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.display_name ?? r.email}</div>
                    <div className="font-mono text-[11px] text-muted">{r.email}</div>
                  </div>
                  <span className="chip bg-accentSoft text-accent">revendedor</span>
                </div>
                <div className="mt-3 text-sm text-muted">
                  {bots.length} instalación{bots.length === 1 ? "" : "es"} propia{bots.length === 1 ? "" : "s"}
                </div>
                <div className="mt-3 flex justify-end">
                  <button className="btn-ghost py-1 text-xs" onClick={() => setRole(r.id, "cliente")}>
                    Devolver a cliente
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
