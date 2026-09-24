import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Novedad } from "../lib/types";

interface Form {
  id?: string;
  fecha: string;
  origen: "kooni" | "kooni+";
  tipo: "nuevo" | "mejora" | "arreglo";
  version: string;
  titulo: string;
  cuerpo: string;
  cta_label: string;
  cta_url: string;
  update_hint: string;
  visible: boolean;
}

const EMPTY: Form = {
  fecha: new Date().toISOString().slice(0, 10),
  origen: "kooni",
  tipo: "nuevo",
  version: "",
  titulo: "",
  cuerpo: "",
  cta_label: "",
  cta_url: "",
  update_hint: "",
  visible: true,
};

export default function AdminNovedades() {
  const [rows, setRows] = useState<Novedad[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database
      .from("novedades")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) setErr((error as any).message);
    setRows((data ?? []) as Novedad[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function openNew() {
    setErr("");
    setForm({ ...EMPTY });
  }

  function openEdit(n: Novedad) {
    setErr("");
    setForm({
      id: n.id,
      fecha: n.fecha,
      origen: n.origen,
      tipo: n.tipo,
      version: n.version ?? "",
      titulo: n.titulo,
      cuerpo: n.cuerpo ?? "",
      cta_label: n.cta_label ?? "",
      cta_url: n.cta_url ?? "",
      update_hint: n.update_hint ?? "",
      visible: n.visible,
    });
  }

  async function save() {
    if (!form) return;
    if (!form.titulo.trim()) {
      setErr("El título es obligatorio.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const payload = {
        fecha: form.fecha,
        origen: form.origen,
        tipo: form.tipo,
        version: form.version || null,
        titulo: form.titulo,
        cuerpo: form.cuerpo || null,
        cta_label: form.cta_label || null,
        cta_url: form.cta_url || null,
        update_hint: form.update_hint || null,
        visible: form.visible,
      };
      const { error } = form.id
        ? await insforge.database.from("novedades").update(payload).eq("id", form.id)
        : await insforge.database.from("novedades").insert([payload]);
      if (error) throw error;
      setForm(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const { error } = await insforge.database.from("novedades").delete().eq("id", id);
    if (error) setErr((error as any).message);
    await load();
  }

  async function toggle(n: Novedad) {
    await insforge.database.from("novedades").update({ visible: !n.visible }).eq("id", n.id);
    await load();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Novedades</h1>
          <p className="text-sm text-muted">El changelog que ven los clientes en su hub.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>Nueva novedad</button>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Título</th>
              <th>Tipo</th>
              <th>Origen</th>
              <th>Visible</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-muted">Cargando…</td>
              </tr>
            )}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="text-muted">Sin novedades. Creá la primera.</td>
              </tr>
            )}
            {rows.map((n) => (
              <tr key={n.id}>
                <td className="font-mono text-[12px] text-muted">{n.fecha}</td>
                <td className="max-w-md truncate">{n.titulo}</td>
                <td><span className="chip bg-panel2 text-muted">{n.tipo}</span></td>
                <td><span className="chip bg-panel2 text-muted">{n.origen}</span></td>
                <td>
                  <button className={`chip ${n.visible ? "bg-ok/15 text-ok" : "bg-panel2 text-muted"}`} onClick={() => toggle(n)}>
                    {n.visible ? "visible" : "borrador"}
                  </button>
                </td>
                <td className="text-right">
                  <button className="btn-ghost py-1 mr-2" onClick={() => openEdit(n)}>Editar</button>
                  <button className="btn-danger py-1" onClick={() => remove(n.id)}>Borrar</button>
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
              <h2 className="font-display text-lg font-semibold">{form.id ? "Editar novedad" : "Nueva novedad"}</h2>
              <button className="text-muted hover:text-cream" onClick={() => setForm(null)}>✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Fecha</label>
                <input type="date" className="input mt-1" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div>
                <label className="label">Versión (ej. bot 1.48.0)</label>
                <input className="input mt-1" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input mt-1" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as any })}>
                  <option value="nuevo">Nuevo</option>
                  <option value="mejora">Mejora</option>
                  <option value="arreglo">Arreglo</option>
                </select>
              </div>
              <div>
                <label className="label">Origen</label>
                <select className="input mt-1" value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value as any })}>
                  <option value="kooni">Kooni</option>
                  <option value="kooni+">Kooni+</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="label">Título</label>
              <input className="input mt-1" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="mt-4">
              <label className="label">Cuerpo</label>
              <textarea className="input mt-1" rows={4} value={form.cuerpo} onChange={(e) => setForm({ ...form, cuerpo: e.target.value })} />
            </div>
            <div className="mt-4">
              <label className="label">Cómo activarlo (opcional)</label>
              <input className="input mt-1 font-mono text-[12px]" value={form.update_hint} placeholder="npx kooni-bot update" onChange={(e) => setForm({ ...form, update_hint: e.target.value })} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="label">CTA — texto</label>
                <input className="input mt-1" value={form.cta_label} placeholder="Ver conexiones" onChange={(e) => setForm({ ...form, cta_label: e.target.value })} />
              </div>
              <div>
                <label className="label">CTA — URL</label>
                <input className="input mt-1" value={form.cta_url} placeholder="https://…" onChange={(e) => setForm({ ...form, cta_url: e.target.value })} />
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
              Visible para los clientes
            </label>

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
