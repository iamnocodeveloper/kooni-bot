import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { IaProveedor } from "../lib/types";

export default function AdminIA() {
  const [rows, setRows] = useState<IaProveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database.from("ia_proveedores").select("*").order("orden", { ascending: true }).limit(50);
    if (error) setErr((error as any).message);
    setRows((data ?? []) as IaProveedor[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function setModelos(id: string, text: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, modelos: text.split("\n").map((s) => s.trim()).filter(Boolean) } : r)));
  }
  function setField(id: string, patch: Partial<IaProveedor>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function guardar(p: IaProveedor) {
    setBusy(p.id);
    setErr("");
    setFlash("");
    const { error } = await insforge.database.from("ia_proveedores").update({ incluido: p.incluido, activo: p.activo, modelos: p.modelos }).eq("id", p.id);
    if (error) setErr((error as any).message);
    else setFlash(`Guardado: ${p.nombre}`);
    setBusy("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Proveedores IA</h1>
        <p className="text-sm text-muted">
          El "cerebro" que el panel del bot ofrece. Marcá uno como <b className="text-cream">incluido</b> para ofrecerlo como cerebro de plataforma; el resto son BYO-LLM (llave del cliente).
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {flash && <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{flash}</div>}

      {loading ? (
        <div className="text-muted">Cargando…</div>
      ) : (
        rows.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{p.nombre}</span>
                <span className="font-mono text-[11px] text-muted">{p.id}</span>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={p.activo} onChange={(e) => setField(p.id, { activo: e.target.checked })} />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={p.incluido} onChange={(e) => setField(p.id, { incluido: e.target.checked })} />
                  Cerebro incluido
                </label>
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Modelos (uno por línea)</label>
              <textarea
                className="input mt-1 font-mono text-[12px]"
                rows={4}
                value={(p.modelos ?? []).join("\n")}
                onChange={(e) => setModelos(p.id, e.target.value)}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button className="btn-primary" disabled={busy === p.id} onClick={() => guardar(p)}>
                {busy === p.id ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
