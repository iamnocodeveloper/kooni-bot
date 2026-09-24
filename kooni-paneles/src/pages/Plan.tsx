import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { insforge } from "../lib/insforge";
import type { Licencia, Plan, ProveedorPago } from "../lib/types";

export default function PlanPage() {
  const [params] = useSearchParams();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorPago[]>([]);
  const [lics, setLics] = useState<Licencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const [pl, lic] = await Promise.all([
        insforge.database.from("planes").select("*").eq("activo", true).order("orden", { ascending: true }).limit(20),
        insforge.database.from("licencias").select("id, plan, kind, expiry, estado, modules, bot_slug, inst_uid").order("created_at", { ascending: false }).limit(50),
      ]);
      setPlanes((pl.data ?? []) as Plan[]);
      setLics((lic.data ?? []) as Licencia[]);
      try {
        const { data } = await insforge.functions.invoke("pago-proveedores", { body: {} });
        setProveedores(((data as any)?.providers ?? []) as ProveedorPago[]);
      } catch {
        /* sin proveedores */
      }
      setLoading(false);
    })();
  }, []);

  const pro = lics.find((l) => l.plan === "pro" && l.estado !== "revocada");

  async function pagar(planId: string, provider: string) {
    setErr("");
    setBusy(provider);
    try {
      const { data, error } = await insforge.functions.invoke("pago-crear", { body: { plan_id: planId, provider } });
      if (error) throw error;
      const j = data as any;
      if (j?.error) throw new Error(j.error);
      if (j?.url) {
        location.href = j.url;
        return;
      }
      throw new Error("No se pudo iniciar el pago.");
    } catch (e: any) {
      setErr(e?.message || "No se pudo iniciar el pago");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Mi plan</h1>
        <p className="text-sm text-muted">Tu plan actual y la forma de activar Kooni+.</p>
      </div>

      {params.get("pago") === "ok" && (
        <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">
          Pago recibido. Tu plan se activa en cuanto el proveedor confirme (unos segundos). Refrescá en un momento.
        </div>
      )}
      {params.get("pago") === "cancelado" && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Pago cancelado.</div>
      )}
      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}

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
            <span className="text-sm text-muted">Activá Kooni+ para encender los superpoderes y quitar los límites.</span>
          </div>
        )}
      </div>

      {planes.map((p) => (
        <div key={p.id} className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-semibold">{p.nombre}</span>
              {p.badge ? <span className="chip bg-accentSoft text-accent">{p.badge}</span> : null}
            </div>
            <div className="text-right">
              {p.precio != null ? (
                <div className="font-mono text-lg">${Number(p.precio).toFixed(2)} <span className="text-xs text-muted">/mes</span></div>
              ) : (
                <div className="text-sm text-muted">Gratis</div>
              )}
              {p.precio_nota ? <div className="text-[11px] text-muted">{p.precio_nota}</div> : null}
            </div>
          </div>
          {p.descripcion ? <p className="mt-2 text-sm text-muted">{p.descripcion}</p> : null}
          {p.incluye?.length ? (
            <ul className="mt-3 grid gap-1 text-sm md:grid-cols-2">
              {p.incluye.map((x, i) => (
                <li key={i} className="text-muted">✓ {x}</li>
              ))}
            </ul>
          ) : null}

          {p.precio != null && !pro ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {proveedores.map((pr) => (
                <button
                  key={pr.id}
                  className="btn-primary"
                  disabled={!pr.listo || busy === pr.id}
                  title={pr.listo ? "" : `Falta configurar: ${pr.faltan.join(", ")}`}
                  onClick={() => pagar(p.id, pr.id)}
                >
                  {busy === pr.id ? "Abriendo…" : `Pagar con ${pr.nombre}`}
                </button>
              ))}
              {proveedores.length === 0 ? <span className="text-sm text-muted">No hay formas de pago configuradas todavía.</span> : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
