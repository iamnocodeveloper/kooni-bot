import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Profile } from "../lib/types";
import { logAdmin } from "../lib/audit";

export default function AdminEquipo() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database.from("profiles").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) setErr((error as any).message);
    setProfiles((data ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function promover() {
    setErr("");
    setFlash("");
    const target = email.trim().toLowerCase();
    const p = profiles.find((x) => (x.email ?? "").toLowerCase() === target);
    if (!p) {
      setErr("No encontré esa cuenta. La persona debe registrarse primero en el panel.");
      return;
    }
    const { error } = await insforge.database.from("profiles").update({ role: "admin" }).eq("id", p.id);
    if (error) setErr((error as any).message);
    else {
      await logAdmin("equipo.promover", target);
      setFlash(`Ahora es admin: ${target}`);
      setEmail("");
      await load();
    }
  }

  async function quitar(id: string, email2: string | null) {
    await insforge.database.from("profiles").update({ role: "cliente" }).eq("id", id);
    await logAdmin("equipo.quitar", email2 ?? id);
    await load();
  }

  const admins = profiles.filter((p) => p.role === "admin");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Equipo (admins)</h1>
        <p className="text-sm text-muted">
          Quién puede entrar a este super admin. Promové a una cuenta ya registrada escribiendo su correo.
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {flash && <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{flash}</div>}

      <div className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[260px] flex-1">
          <label className="label">Correo de la cuenta</label>
          <input className="input mt-1" type="email" placeholder="alguien@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={promover}>Hacer admin</button>
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Correo</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="text-muted">Cargando…</td></tr>
            )}
            {!loading && admins.length === 0 && (
              <tr><td colSpan={4} className="text-muted">Sin admins (además de vos).</td></tr>
            )}
            {admins.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-[12px]">{p.email}</td>
                <td>{p.display_name ?? "—"}</td>
                <td><span className="chip bg-accentSoft text-accent">admin</span></td>
                <td className="text-right">
                  <button className="btn-danger py-1 text-xs" onClick={() => quitar(p.id, p.email)}>Quitar admin</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
