import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { insforge } from "../lib/insforge";
import type { Licencia, Plan, ProveedorPago } from "../lib/types";

function loadPayphoneSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).PPaymentButtonBox) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Payphone"));
    document.head.appendChild(script);
  });
}

export default function PlanPage() {
  const [params] = useSearchParams();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorPago[]>([]);
  const [lics, setLics] = useState<Licencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [aviso, setAviso] = useState("");
  const [widget, setWidget] = useState<Record<string, any> | null>(null);
  const [manual, setManual] = useState<Record<string, any> | null>(null);

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

  // Al volver de Payphone: confirmar la transacción (obligatorio dentro de 5 min).
  useEffect(() => {
    const id = params.get("id");
    const clientTransactionId = params.get("clientTransactionId");
    if (!id || !clientTransactionId) return;
    (async () => {
      setAviso("Confirmando el pago…");
      try {
        const { data, error } = await insforge.functions.invoke("pago-confirmar-payphone", { body: { id: Number(id), clientTxId: clientTransactionId } });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        setAviso("✓ Pago confirmado. Tu plan se activó.");
      } catch (e: any) {
        setAviso("");
        setErr(e?.message || "No se pudo confirmar el pago");
      }
    })();
  }, [params]);

  // Render de la Cajita de Payphone cuando corresponde.
  useEffect(() => {
    if (!widget) return;
    (async () => {
      try {
        await loadPayphoneSDK();
        const ppb = new (window as any).PPaymentButtonBox({ ...widget, defaultMethod: "card" });
        ppb.render("pp-button");
      } catch (e: any) {
        setErr(e?.message || "No se pudo cargar Payphone");
      }
    })();
  }, [widget]);

  const pro = lics.find((l) => l.plan === "pro" && l.estado !== "revocada");

  async function pagar(planId: string, provider: string) {
    setErr("");
    setManual(null);
    setWidget(null);
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
      if (j?.widget) {
        setWidget(j.widget);
        return;
      }
      if (j?.manual) {
        setManual(j.manual);
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
          Pago recibido. Se activa en cuanto el proveedor confirme (unos segundos).
        </div>
      )}
      {params.get("pago") === "cancelado" && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Pago cancelado.</div>
      )}
      {aviso && <div className="rounded-lg border border-line bg-panel2 px-3 py-2 text-xs text-muted">{aviso}</div>}
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

      {(widget || manual) && (
        <div className="card p-5">
          <div className="font-semibold">{widget ? "Pagá con Payphone" : "Pago manual (Binance)"}</div>
          {widget ? (
            <>
              <p className="mt-1 text-sm text-muted">Completá el pago en la cajita. Tenés 10 minutos.</p>
              <div id="pp-button" className="mt-3" />
            </>
          ) : (
            <div className="mt-2 flex flex-col gap-2 text-sm text-muted">
              {manual?.instructions ? <p className="whitespace-pre-wrap">{manual.instructions}</p> : null}
              <div className="rounded-lg border border-line bg-panel2 p-3 font-mono text-[12px]">
                <div>Monto: {manual?.currency} {Number(manual?.amount).toFixed(2)}</div>
                {manual?.pay_id ? <div>Destino: {manual.pay_id}</div> : null}
                <div>Referencia (ponela en la transferencia): {manual?.ref}</div>
              </div>
              <p className="text-[12px]">
                Cuando transferís, el administrador confirma el pago y se activa tu plan. Mandá el comprobante con la referencia.
              </p>
            </div>
          )}
        </div>
      )}

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
              {proveedores.filter((pr) => pr.listo).map((pr) => (
                <button key={pr.id} className="btn-primary" disabled={busy === pr.id} onClick={() => pagar(p.id, pr.id)}>
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
