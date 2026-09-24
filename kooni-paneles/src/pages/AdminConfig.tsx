import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { ConfigItem } from "../lib/types";

const LARGOS = new Set(["terminos", "privacidad", "aviso_upgrade"]);

export default function AdminConfig() {
  const [rows, setRows] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database.from("config_plataforma").select("*").order("clave", { ascending: true }).limit(100);
    if (error) setErr((error as any).message);
    setRows((data ?? []) as ConfigItem[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function setValor(clave: string, valor: string) {
    setRows((rs) => rs.map((r) => (r.clave === clave ? { ...r, valor } : r)));
  }

  async function guardar(r: ConfigItem) {
    setBusy(r.clave);
    setErr("");
    setFlash("");
    const { error } = await insforge.database.from("config_plataforma").update({ valor: r.valor ?? "" }).eq("clave", r.clave);
    if (error) setErr((error as any).message);
    else setFlash("Guardado ✓");
    setBusy("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted">Ajustes generales de la plataforma: URL del sitio, soporte, marca y textos legales.</p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {flash && <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{flash}</div>}

      {loading ? (
        <div className="text-muted">Cargando…</div>
      ) : (
        rows.map((r) => (
          <div key={r.clave} className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{r.clave}</div>
                {r.descripcion ? <div className="text-[11.5px] text-muted">{r.descripcion}</div> : null}
              </div>
              <button className="btn-primary" disabled={busy === r.clave} onClick={() => guardar(r)}>
                {busy === r.clave ? "Guardando…" : "Guardar"}
              </button>
            </div>
            <div className="mt-3">
              {LARGOS.has(r.clave) ? (
                <textarea className="input mt-1" rows={5} value={r.valor ?? ""} onChange={(e) => setValor(r.clave, e.target.value)} />
              ) : (
                <input className="input mt-1 font-mono text-[12px]" value={r.valor ?? ""} onChange={(e) => setValor(r.clave, e.target.value)} />
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
