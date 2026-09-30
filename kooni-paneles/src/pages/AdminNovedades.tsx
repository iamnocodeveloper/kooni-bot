import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";
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
  const { t } = useI18n();
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
      setErr(t("admin.novedades.errTitleRequired"));
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
      setErr(e?.message || t("admin.novedades.errSave"));
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
          <h1 className="font-display text-xl font-semibold">{t("admin.novedades.title")}</h1>
          <p className="text-sm text-muted">{t("admin.novedades.subtitle")}</p>
        </div>
        <button className="btn-primary" onClick={openNew}>{t("admin.novedades.new")}</button>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("admin.novedades.colDate")}</th>
              <th>{t("admin.novedades.colTitle")}</th>
              <th>{t("admin.novedades.colType")}</th>
              <th>{t("admin.novedades.colOrigin")}</th>
              <th>{t("admin.novedades.colVisible")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-muted">{t("common.loading")}</td>
              </tr>
            )}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="text-muted">{t("admin.novedades.empty")}</td>
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
                    {n.visible ? t("admin.novedades.statusVisible") : t("admin.novedades.statusDraft")}
                  </button>
                </td>
                <td className="text-right">
                  <button className="btn-ghost py-1 mr-2" onClick={() => openEdit(n)}>{t("admin.novedades.edit")}</button>
                  <button className="btn-danger py-1" onClick={() => remove(n.id)}>{t("admin.novedades.delete")}</button>
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
              <h2 className="font-display text-lg font-semibold">{form.id ? t("admin.novedades.editTitle") : t("admin.novedades.new")}</h2>
              <button className="text-muted hover:text-cream" onClick={() => setForm(null)}>✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t("admin.novedades.labelDate")}</label>
                <input type="date" className="input mt-1" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div>
                <label className="label">{t("admin.novedades.labelVersion")}</label>
                <input className="input mt-1" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </div>
              <div>
                <label className="label">{t("admin.novedades.labelType")}</label>
                <select className="input mt-1" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as any })}>
                  <option value="nuevo">{t("admin.novedades.optNuevo")}</option>
                  <option value="mejora">{t("admin.novedades.optMejora")}</option>
                  <option value="arreglo">{t("admin.novedades.optArreglo")}</option>
                </select>
              </div>
              <div>
                <label className="label">{t("admin.novedades.labelOrigin")}</label>
                <select className="input mt-1" value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value as any })}>
                  <option value="kooni">Kooni</option>
                  <option value="kooni+">Kooni+</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="label">{t("admin.novedades.labelTitle")}</label>
              <input className="input mt-1" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="mt-4">
              <label className="label">{t("admin.novedades.labelBody")}</label>
              <textarea className="input mt-1" rows={4} value={form.cuerpo} onChange={(e) => setForm({ ...form, cuerpo: e.target.value })} />
            </div>
            <div className="mt-4">
              <label className="label">{t("admin.novedades.labelHint")}</label>
              <input className="input mt-1 font-mono text-[12px]" value={form.update_hint} placeholder="npx kooni-bot update" onChange={(e) => setForm({ ...form, update_hint: e.target.value })} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t("admin.novedades.labelCtaText")}</label>
                <input className="input mt-1" value={form.cta_label} placeholder={t("admin.novedades.phCtaText")} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} />
              </div>
              <div>
                <label className="label">{t("admin.novedades.labelCtaUrl")}</label>
                <input className="input mt-1" value={form.cta_url} placeholder="https://…" onChange={(e) => setForm({ ...form, cta_url: e.target.value })} />
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
              {t("admin.novedades.visibleForClients")}
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
              <button className="btn-primary" disabled={busy} onClick={save}>{busy ? t("common.saving") : t("common.save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
