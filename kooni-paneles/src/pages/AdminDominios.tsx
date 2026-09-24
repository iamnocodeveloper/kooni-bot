import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Dominio, Instalacion } from "../lib/types";

export default function AdminDominios() {
  const [rows, setRows] = useState<Dominio[]>([]);
  const [insts, setInsts] = useState<Instalacion[]>([]);
  const [hostname, setHostname] = useState("");
  const [instId, setInstId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const [dm, inst] = await Promise.all([
      insforge.database.from("dominios").select("*").order("created_at", { ascending: false }).limit(300),
      insforge.database.from("instalaciones").select("id, uid, slug, bot_name, user_id").order("last_seen", { ascending: false }).limit(300),
    ]);
    setRows((dm.data ?? []) as Dominio[]);
    setInsts((inst.data ?? []) as Instalacion[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setErr("");
    const host = hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!host) {
      setErr("Poné un dominio (ej. panel.tunegocio.com).");
      return;
    }
    const inst = insts.find((i) => i.id === instId);
    const { error } = await insforge.database.from("dominios").insert([
      { hostname: host, instalacion_id: instId || null, user_id: inst?.user_id, estado: "pendiente" },
    ]);
    if (error) {
      setErr((error as any).message);
      return;
    }
    setHostname("");
    await load();
  }

  async function setEstado(id: string, estado: Dominio["estado"]) {
    await insforge.database.from("dominios").update({ estado }).eq("id", id);
    await load();
  }

  async function remove(id: string) {
    await insforge.database.from("dominios").delete().eq("id", id);
    await load();
  }

  const instLabel = (id: string | null) => {
    const i = insts.find((x) => x.id === id);
    return i ? i.bot_name ?? i.slug ?? i.uid ?? "—" : "—";
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Dominios</h1>
        <p className="text-sm text-muted">
          Dominios propios por instalación. El deploy del dominio se hace en el Cloudflare del cliente; acá queda el registro.
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}

      <div className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[240px] flex-1">
          <label className="label">Dominio</label>
          <input className="input mt-1 font-mono" placeholder="panel.tunegocio.com" value={hostname} onChange={(e) => setHostname(e.target.value)} />
        </div>
        <div className="min-w-[200px]">
          <label className="label">Instalación</label>
          <select className="input mt-1" value={instId} onChange={(e) => setInstId(e.target.value)}>
            <option value="">—</option>
            {insts.map((i) => (
              <option key={i.id} value={i.id}>{i.bot_name ?? i.slug ?? i.uid}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={add}>Agregar</button>
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Dominio</th>
              <th>Instalación</th>
              <th>Estado</th>
              <th>Alta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="text-muted">Cargando…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="text-muted">Sin dominios registrados.</td></tr>
            )}
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="font-mono text-[12px]">{d.hostname}</td>
                <td className="text-muted">{instLabel(d.instalacion_id)}</td>
                <td>
                  <select className="input py-1 text-xs" value={d.estado} onChange={(e) => setEstado(d.id, e.target.value as any)}>
                    <option value="pendiente">pendiente</option>
                    <option value="activo">activo</option>
                    <option value="error">error</option>
                  </select>
                </td>
                <td className="text-muted">{new Date(d.created_at).toLocaleDateString("es")}</td>
                <td className="text-right">
                  <button className="btn-danger py-1 text-xs" onClick={() => remove(d.id)}>Borrar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
