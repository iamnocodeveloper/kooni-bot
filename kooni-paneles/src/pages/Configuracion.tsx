import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";
import type { Colaborador } from "../lib/types";

const MAX = 3;

export default function Configuracion() {
  const { user } = useAuth();
  const [idioma, setIdioma] = useState<string>(() => localStorage.getItem("kooni.lang") ?? "es");
  const [cols, setCols] = useState<Colaborador[]>([]);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [puedeEditar, setPuedeEditar] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function cambiarIdioma(v: string) {
    setIdioma(v);
    localStorage.setItem("kooni.lang", v);
  }

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database
      .from("colaboradores_cuenta")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) setErr((error as any).message);
    setCols((data ?? []) as Colaborador[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const activos = cols.filter((c) => c.estado !== "revocado");
  const lleno = activos.length >= MAX;

  async function invitar() {
    setErr("");
    setFlash("");
    if (!email.trim()) {
      setErr("Poné el correo de la persona.");
      return;
    }
    if (lleno) {
      setErr(`Máximo ${MAX} colaboradores.`);
      return;
    }
    const { error } = await insforge.database.from("colaboradores_cuenta").insert([
      {
        owner_id: user?.id,
        email: email.trim().toLowerCase(),
        nombre: nombre.trim() || null,
        puede_editar: puedeEditar,
        estado: "invitado",
      },
    ]);
    if (error) {
      setErr((error as any).message);
      return;
    }
    setEmail("");
    setNombre("");
    setPuedeEditar(true);
    setFlash("Invitación creada. Copiá el link y mandáselo.");
    await load();
  }

  async function revocar(id: string) {
    await insforge.database.from("colaboradores_cuenta").delete().eq("id", id);
    await load();
  }

  const linkDe = (c: Colaborador) => `${location.origin}/invitacion?token=${c.token}`;

  async function copiar(c: Colaborador) {
    try {
      await navigator.clipboard.writeText(linkDe(c));
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* clipboard bloqueado */
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted">Preferencias de tu cuenta y tu equipo de agencia.</p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {flash && <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{flash}</div>}

      <div className="card p-5">
        <div className="font-semibold">Idioma</div>
        <p className="mt-1 text-sm text-muted">
          En qué idioma ves este panel. No cambia cómo le habla tu bot a tus clientes — eso se elige en el panel de cada bot.
        </p>
        <div className="mt-3 max-w-xs">
          <label className="label">Idioma del panel</label>
          <select className="input mt-1" value={idioma} onChange={(e) => cambiarIdioma(e.target.value)}>
            <option value="es">Español (LATAM)</option>
            <option value="en">English</option>
          </select>
          <p className="mt-1 text-[11px] text-muted">Por ahora el panel está en español; esto guarda tu preferencia.</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Equipo de agencia</div>
            <p className="mt-1 text-sm text-muted">
              Invitá a tu gente con SU propio correo: entran a este panel y operan tus bots. La facturación y este equipo
              quedan solo con vos. <b className="text-cream">Máximo {MAX}</b>.
            </p>
          </div>
          <span className="chip bg-panel2 text-muted">{activos.length}/{MAX}</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="label">Para quién es</label>
            <input className="input mt-1" placeholder="ej. Carlos, automatizaciones" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="label">Correo</label>
            <input className="input mt-1" type="email" placeholder="carlos@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 pb-2 text-xs text-muted">
              <input type="checkbox" checked={puedeEditar} onChange={(e) => setPuedeEditar(e.target.checked)} />
              Puede editar
            </label>
            <button className="btn-primary mb-1" disabled={lleno} onClick={invitar}>Crear invitación</button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-line">
          <table className="tbl">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Estado</th>
                <th>Permiso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="text-muted">Cargando…</td>
                </tr>
              )}
              {!loading && cols.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">Aún no tienes colaboradores.</td>
                </tr>
              )}
              {cols.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div>{c.nombre ?? c.email}</div>
                    <div className="font-mono text-[11px] text-muted">{c.email}</div>
                  </td>
                  <td>
                    <span className={`chip ${c.estado === "activo" ? "bg-ok/15 text-ok" : "bg-panel2 text-muted"}`}>{c.estado}</span>
                  </td>
                  <td className="text-muted">{c.puede_editar ? "puede editar" : "solo lectura"}</td>
                  <td className="text-right">
                    {c.estado !== "activo" && (
                      <button className="btn-ghost py-1 mr-2 text-xs" onClick={() => copiar(c)}>
                        {copiedId === c.id ? "✓ Copiado" : "Copiar link"}
                      </button>
                    )}
                    <button className="btn-danger py-1 text-xs" onClick={() => revocar(c.id)}>Revocar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
