import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Modulo, Plan } from "../lib/types";

interface Form {
  id: string;
  nombre: string;
  precio: string;
  moneda: string;
  precio_nota: string;
  etapa: string;
  badge: string;
  descripcion: string;
  incluye: string;
  modulos: string[];
  orden: string;
  activo: boolean;
  nuevo: boolean;
}

export default function AdminPlanes() {
  const [rows, setRows] = useState<Plan[]>([]);
  const [mods, setMods] = useState<Modulo[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const [pl, mo] = await Promise.all([
      insforge.database.from("planes").select("*").order("orden", { ascending: true }).limit(50),
      insforge.database.from("modulos_catalogo").select("*").order("orden", { ascending: true }).limit(200),
    ]);
    setRows((pl.data ?? []) as Plan[]);
    setMods((mo.data ?? []) as Modulo[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function openNew() {
    setErr("");
    setForm({ id: "", nombre: "", precio: "", moneda: "usd", precio_nota: "", etapa: "", badge: "", descripcion: "", incluye: "", modulos: [], orden: "100", activo: true, nuevo: true });
  }

  function openEdit(p: Plan) {
    setErr("");
    setForm({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio != null ? String(p.precio) : "",
      moneda: p.moneda,
      precio_nota: p.precio_nota ?? "",
      etapa: p.etapa ?? "",
      badge: p.badge ?? "",
      descripcion: p.descripcion ?? "",
      incluye: (p.incluye ?? []).join("\n"),
      modulos: p.modulos ?? [],
      orden: String(p.orden ?? 100),
      activo: p.activo,
      nuevo: false,
    });
  }

  function toggleMod(id: string) {
    if (!form) return;
    setForm({ ...form, modulos: form.modulos.includes(id) ? form.modulos.filter((m) => m !== id) : [...form.modulos, id] });
  }

  async function save() {
    if (!form) return;
    setErr("");
    if (!form.id.trim() || !form.nombre.trim()) {
      setErr("El id y el nombre son obligatorios.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        id: form.id.trim().toLowerCase(),
        nombre: form.nombre,
        precio: form.precio === "" ? null : Number(form.precio),
        moneda: form.moneda || "usd",
        precio_nota: form.precio_nota || null,
        etapa: form.etapa || null,
        badge: form.badge || null,
        descripcion: form.descripcion || null,
        incluye: form.incluye.split("\n").map((s) => s.trim()).filter(Boolean),
        modulos: form.modulos,
        orden: Number(form.orden) || 100,
        activo: form.activo,
      };
      const { error } = form.nuevo
        ? await insforge.database.from("planes").insert([payload])
        : await insforge.database.from("planes").update(payload).eq("id", form.id);
      if (error) throw error;
      setForm(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Planes</h1>
          <p className="text-sm text-muted">Tiers, precios y qué incluye cada plan. Alimenta la página de upgrade.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>Nuevo plan</button>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Precio</th>
              <th>Módulos</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="text-muted">Cargando…</td></tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="font-medium">{p.nombre}</div>
                  <div className="font-mono text-[11px] text-muted">{p.id}</div>
                </td>
                <td className="font-mono">
                  {p.precio != null ? `${p.moneda.toUpperCase()} ${Number(p.precio).toFixed(2)}/mes` : "—"}
                  {p.precio_nota ? <span className="ml-2 text-[11px] text-muted">{p.precio_nota}</span> : null}
                </td>
                <td className="text-muted">{(p.modulos ?? []).length}</td>
                <td>
                  <span className={`chip ${p.activo ? "bg-ok/15 text-ok" : "bg-panel2 text-muted"}`}>{p.activo ? "activo" : "oculto"}</span>
                </td>
                <td className="text-right">
                  <button className="btn-ghost py-1" onClick={() => openEdit(p)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 z-20 flex items-start justify-center overflow-auto bg-black/60 p-6">
          <div className="card w-full max-w-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{form.nuevo ? "Nuevo plan" : "Editar plan"}</h2>
              <button className="text-muted hover:text-cream" onClick={() => setForm(null)}>✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">ID (slug)</label>
                <input className="input mt-1 font-mono" value={form.id} disabled={!form.nuevo} onChange={(e) => setForm({ ...form, id: e.target.value })} />
              </div>
              <div>
                <label className="label">Nombre</label>
                <input className="input mt-1" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label className="label">Precio / mes</label>
                <input className="input mt-1" type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
              </div>
              <div>
                <label className="label">Moneda</label>
                <input className="input mt-1" value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })} />
              </div>
              <div>
                <label className="label">Nota del precio</label>
                <input className="input mt-1" value={form.precio_nota} placeholder="precio de lanzamiento" onChange={(e) => setForm({ ...form, precio_nota: e.target.value })} />
              </div>
              <div>
                <label className="label">Badge / etapa</label>
                <input className="input mt-1" value={form.badge} placeholder="Early" onChange={(e) => setForm({ ...form, badge: e.target.value })} />
              </div>
            </div>

            <div className="mt-4">
              <label className="label">Descripción</label>
              <textarea className="input mt-1" rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </div>

            <div className="mt-4">
              <label className="label">Qué incluye (una por línea)</label>
              <textarea className="input mt-1" rows={5} value={form.incluye} onChange={(e) => setForm({ ...form, incluye: e.target.value })} />
            </div>

            <div className="mt-4">
              <label className="label">Módulos incluidos</label>
              <div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-auto rounded-lg border border-line bg-panel2 p-3">
                {mods.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.modulos.includes(m.id)} onChange={() => toggleMod(m.id)} />
                    <span>{m.nombre}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="label">Orden</label>
                <input className="input mt-1" type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: e.target.value })} />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
                Activo (visible para clientes)
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
