import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Pago, ProveedorPago, Profile } from "../lib/types";

// Host de las edge functions (a donde apuntan los webhooks del proveedor).
const FUNCTIONS_HOST = "https://t6bferet.function2.insforge.app";

export default function AdminFacturacion() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<ProveedorPago[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [pg, pr] = await Promise.all([
        insforge.database.from("pagos").select("*").order("created_at", { ascending: false }).limit(300),
        insforge.functions.invoke("pago-proveedores", { body: {} }),
      ]);
      const rows = (pg.data ?? []) as Pago[];
      setPagos(rows);
      setProviders(((pr.data as any)?.providers ?? []) as ProveedorPago[]);

      const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profs } = await insforge.database.from("profiles").select("id, email").in("id", ids).limit(500);
        const map: Record<string, string> = {};
        for (const p of (profs ?? []) as Profile[]) map[p.id] = p.email ?? p.id;
        setEmails(map);
      }
      setLoading(false);
    })();
  }, []);

  async function confirmar(id: string) {
    const { error } = await insforge.functions.invoke("pago-confirmar-manual", { body: { pago_id: id } });
    if (!error) location.reload();
  }

  const statusCls = (s: string) =>
    s === "pagado" ? "bg-ok/15 text-ok" : s === "pendiente" ? "bg-warn/15 text-warn" : "bg-bad/15 text-bad";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Facturación</h1>
        <p className="text-sm text-muted">
          Pagos de Kooni+ y estado de los proveedores. Cada proveedor se activa solo con poner sus secretos.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {providers.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{p.nombre}</span>
              <span className={`chip ${p.listo ? "bg-ok/15 text-ok" : "bg-panel2 text-muted"}`}>
                {p.listo ? "listo" : "falta configurar"}
              </span>
            </div>
            {!p.listo && p.faltan.length ? (
              <div className="mt-2 font-mono text-[11px] text-muted">{p.faltan.join(" · ")}</div>
            ) : null}
            <div className="mt-3 font-mono text-[11px] text-muted">
              Webhook:<br />
              {FUNCTIONS_HOST}/pago-webhook?provider={p.id}
            </div>
          </div>
        ))}
        {providers.length === 0 && <div className="card p-4 text-sm text-muted">Sin proveedores.</div>}
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Proveedor</th>
              <th>Plan</th>
              <th>Monto</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-muted">Cargando…</td></tr>
            )}
            {!loading && pagos.length === 0 && (
              <tr><td colSpan={7} className="text-muted">Sin pagos todavía.</td></tr>
            )}
            {pagos.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-[12px] text-muted">{new Date(p.created_at).toLocaleDateString("es")}</td>
                <td className="font-mono text-[12px]">{p.user_id ? emails[p.user_id] ?? p.user_id.slice(0, 8) : "—"}</td>
                <td><span className="chip bg-panel2 text-muted">{p.provider}</span></td>
                <td className="text-muted">{p.plan_id ?? "—"}</td>
                <td className="font-mono">{p.amount != null ? `${p.currency} ${Number(p.amount).toFixed(2)}` : "—"}</td>
                <td><span className={`chip ${statusCls(p.status)}`}>{p.status}</span></td>
                <td className="text-right">
                  {p.status === "pendiente" ? (
                    <button className="btn-ghost py-1 text-xs" onClick={() => confirmar(p.id)}>Marcar pagado</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
