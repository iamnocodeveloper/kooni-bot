import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";
import type { Pack } from "../lib/types";

export default function AdminPacks() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Pack[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database.from("packs").select("*").order("orden", { ascending: true }).limit(100);
    if (error) setErr((error as any).message);
    setRows((data ?? []) as Pack[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function setField(id: string, patch: Partial<Pack>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function guardar(p: Pack) {
    setBusy(p.id);
    setErr("");
    setFlash("");
    const { error } = await insforge.database
      .from("packs")
      .update({ nombre: p.nombre, descripcion: p.descripcion, playbook: p.playbook, emoji: p.emoji, version: p.version, activo: p.activo })
      .eq("id", p.id);
    if (error) setErr((error as any).message);
    else setFlash(t("admin.packs.saved", { name: p.nombre }));
    setBusy("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("admin.packs.title")}</h1>
        <p className="text-sm text-muted">
          {t("admin.packs.subtitle")}
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {flash && <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{flash}</div>}

      {loading ? (
        <div className="text-muted">{t("common.loading")}</div>
      ) : (
        rows.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{p.emoji}</span>
                <div>
                  <div className="font-semibold">{p.nombre}</div>
                  <div className="font-mono text-[11px] text-muted">{p.id} · v{p.version ?? "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={p.activo} onChange={(e) => setField(p.id, { activo: e.target.checked })} />
                  {t("common.active")}
                </label>
                <button className="btn-ghost py-1 text-xs" onClick={() => setOpen(open === p.id ? null : p.id)}>
                  {open === p.id ? t("admin.packs.close") : t("admin.packs.edit")}
                </button>
              </div>
            </div>

            <p className="mt-2 text-sm text-muted">{p.descripcion}</p>

            {open === p.id && (
              <div className="mt-4 flex flex-col gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">{t("common.name")}</label>
                    <input className="input mt-1" value={p.nombre} onChange={(e) => setField(p.id, { nombre: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">{t("admin.packs.labelEmoji")}</label>
                    <input className="input mt-1" value={p.emoji ?? ""} onChange={(e) => setField(p.id, { emoji: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label">{t("admin.packs.labelDescription")}</label>
                  <input className="input mt-1" value={p.descripcion ?? ""} onChange={(e) => setField(p.id, { descripcion: e.target.value })} />
                </div>
                <div>
                  <label className="label">{t("admin.packs.labelPlaybook")}</label>
                  <textarea
                    className="input mt-1"
                    rows={5}
                    value={p.playbook ?? ""}
                    placeholder={t("admin.packs.phPlaybook")}
                    onChange={(e) => setField(p.id, { playbook: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <button className="btn-primary" disabled={busy === p.id} onClick={() => guardar(p)}>
                    {busy === p.id ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
