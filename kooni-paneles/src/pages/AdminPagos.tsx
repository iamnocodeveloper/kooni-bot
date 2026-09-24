import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { ProveedorConfig } from "../lib/types";

// Campos por proveedor (nombre técnico de la key → etiqueta).
const CAMPOS: Record<string, [string, string][]> = {
  stripe: [
    ["secret_key", "Secret Key (sk_…)"],
    ["webhook_secret", "Webhook signing secret (whsec_…)"],
  ],
  paypal: [
    ["client_id", "Client ID"],
    ["client_secret", "Client Secret"],
    ["webhook_id", "Webhook ID"],
  ],
  payphone: [
    ["token", "Token"],
    ["store_id", "Store ID"],
  ],
  binance: [
    ["pay_id", "Binance Pay ID / USDT wallet"],
    ["instructions", "Instrucciones para el cliente"],
  ],
};

export default function AdminPagos() {
  const [rows, setRows] = useState<ProveedorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [flash, setFlash] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database.from("pago_proveedores").select("*").order("orden", { ascending: true });
    if (error) setErr((error as any).message);
    setRows((data ?? []) as ProveedorConfig[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function setField(id: string, key: string, value: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, config: { ...r.config, [key]: value } } : r)));
  }
  function setProv(id: string, patch: Partial<ProveedorConfig>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function guardar(p: ProveedorConfig) {
    setSaving(p.id);
    setErr("");
    setFlash("");
    try {
      const { error } = await insforge.database.from("pago_proveedores").update({
        activo: p.activo,
        modo: p.modo,
        config: p.config,
      }).eq("id", p.id);
      if (error) throw error;
      setFlash(`Guardado: ${p.nombre}`);
    } catch (e: any) {
      setErr(e?.message || "No se pudo guardar");
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Configuración de pagos</h1>
        <p className="text-sm text-muted">
          Pegá las keys de cada proveedor acá. Se activa solo cuando el proveedor está encendido y completo.
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {flash && <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{flash}</div>}

      {loading ? (
        <div className="text-muted">Cargando…</div>
      ) : (
        rows.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{p.nombre}</span>
                <span className="font-mono text-[11px] text-muted">{p.id}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={p.activo} onChange={(e) => setProv(p.id, { activo: e.target.checked })} />
                  Encendido
                </label>
                <select className="input py-1 text-xs" value={p.modo} onChange={(e) => setProv(p.id, { modo: e.target.value as any })}>
                  <option value="test">Pruebas</option>
                  <option value="live">Producción</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(CAMPOS[p.id] ?? []).map(([key, label]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  {key === "instructions" ? (
                    <textarea className="input mt-1" rows={2} value={p.config?.[key] ?? ""} onChange={(e) => setField(p.id, key, e.target.value)} />
                  ) : (
                    <input className="input mt-1 font-mono text-[12px]" value={p.config?.[key] ?? ""} onChange={(e) => setField(p.id, key, e.target.value)} />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <button className="btn-primary" disabled={saving === p.id} onClick={() => guardar(p)}>
                {saving === p.id ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
