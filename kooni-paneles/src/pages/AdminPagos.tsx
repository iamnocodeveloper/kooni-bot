import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n, type MessageKey } from "../lib/i18n";
import type { ProveedorConfig } from "../lib/types";

// Campos por proveedor (nombre técnico de la key → etiqueta).
const CAMPOS: Record<string, [string, MessageKey][]> = {
  stripe: [
    ["secret_key", "admin.pagos.fieldSecretKey"],
    ["webhook_secret", "admin.pagos.fieldWebhookSecret"],
  ],
  paypal: [
    ["client_id", "admin.pagos.fieldClientId"],
    ["client_secret", "admin.pagos.fieldClientSecret"],
    ["webhook_id", "admin.pagos.fieldWebhookId"],
  ],
  payphone: [
    ["token", "admin.pagos.fieldToken"],
    ["store_id", "admin.pagos.fieldStoreId"],
  ],
  binance: [
    ["pay_id", "admin.pagos.fieldPayId"],
    ["instructions", "admin.pagos.fieldInstructions"],
  ],
};

export default function AdminPagos() {
  const { t } = useI18n();
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
      setFlash(t("admin.pagos.saved", { nombre: p.nombre }));
    } catch (e: any) {
      setErr(e?.message || t("admin.pagos.errSave"));
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("admin.pagos.title")}</h1>
        <p className="text-sm text-muted">
          {t("admin.pagos.subtitle")}
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {flash && <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{flash}</div>}

      {loading ? (
        <div className="text-muted">{t("common.loading")}</div>
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
                  {t("admin.pagos.enabled")}
                </label>
                <select className="input py-1 text-xs" value={p.modo} onChange={(e) => setProv(p.id, { modo: e.target.value as any })}>
                  <option value="test">{t("admin.pagos.modeTest")}</option>
                  <option value="live">{t("admin.pagos.modeLive")}</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(CAMPOS[p.id] ?? []).map(([key, label]) => (
                <div key={key}>
                  <label className="label">{t(label)}</label>
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
                {saving === p.id ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
