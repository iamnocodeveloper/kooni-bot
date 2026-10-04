import { useEffect, useMemo, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n, type MessageKey } from "../lib/i18n";
import type { Licencia, Modulo, Profile } from "../lib/types";
import { logAdmin } from "../lib/audit";

const LIMIT_FIELDS: [string, MessageKey][] = [
  ["maxContacts", "admin.licencias.limitContacts"],
  ["maxMessagesPerMonth", "admin.licencias.limitMessages"],
  ["maxChannels", "admin.licencias.limitChannels"],
  ["maxRules", "admin.licencias.limitRules"],
  ["maxAutoDmsPerMonth", "admin.licencias.limitAutoDms"],
  ["maxTrackedLinks", "admin.licencias.limitTrackedLinks"],
  ["maxZernioAccounts", "admin.licencias.limitZernio"],
  ["logRetentionDays", "admin.licencias.limitLogRetention"],
];

const BRAND_FIELDS: [string, MessageKey][] = [
  ["name", "admin.licencias.brandName"],
  ["logo_url", "admin.licencias.brandLogo"],
  ["primary", "admin.licencias.brandPrimary"],
  ["bg", "admin.licencias.brandBg"],
];

interface Form {
  id: string;
  plan: "free" | "pro";
  kind: "lifetime" | "monthly";
  expiry: string;
  estado: "activa" | "revocada" | "vencida";
  modules: string[];
  limits: Record<string, string>;
  brand: Record<string, string>;
  notas: string;
  code: string | null;
  bot_slug: string | null;
  inst_uid: string | null;
}

export default function AdminLicencias() {
  const { t, formatDate } = useI18n();
  const [rows, setRows] = useState<Licencia[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [mods, setMods] = useState<Modulo[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [lastCode, setLastCode] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [lic, mod] = await Promise.all([
      insforge.database.from("licencias").select("*").order("created_at", { ascending: false }).limit(300),
      insforge.database.from("modulos_catalogo").select("*").order("orden", { ascending: true }).limit(200),
    ]);
    const licRows = (lic.data ?? []) as Licencia[];
    setRows(licRows);
    setMods((mod.data ?? []) as Modulo[]);

    const ids = [...new Set(licRows.map((l) => l.user_id))];
    if (ids.length) {
      const { data: profs } = await insforge.database.from("profiles").select("id, email").in("id", ids).limit(500);
      const map: Record<string, string> = {};
      for (const p of (profs ?? []) as Profile[]) map[p.id] = p.email ?? p.id;
      setEmails(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const modName = useMemo(() => Object.fromEntries(mods.map((m) => [m.id, m.nombre])), [mods]);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setErr("");
      setFlash(t("admin.licencias.copied"));
    } catch {
      setErr(t("admin.licencias.copyErr"));
    }
  }

  function openEdit(l: Licencia) {
    setErr("");
    setFlash("");
    setForm({
      id: l.id,
      plan: l.plan,
      kind: l.kind,
      expiry: l.expiry ? l.expiry.slice(0, 10) : "",
      estado: l.estado,
      modules: Array.isArray(l.modules) ? l.modules : [],
      limits: Object.fromEntries(LIMIT_FIELDS.map(([k]) => [k, l.limits?.[k] != null ? String(l.limits[k]) : ""])),
      brand: Object.fromEntries(BRAND_FIELDS.map(([k]) => [k, (l.brand?.[k] as string) ?? ""])),
      notas: l.notas ?? "",
      code: l.code,
      bot_slug: l.bot_slug,
      inst_uid: l.inst_uid,
    });
  }

  function toggleModule(id: string) {
    if (!form) return;
    setForm({ ...form, modules: form.modules.includes(id) ? form.modules.filter((m) => m !== id) : [...form.modules, id] });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setErr("");
    try {
      const expiryMs = form.kind === "monthly" && form.expiry ? new Date(form.expiry + "T23:59:59").getTime() : null;
      const limits = Object.fromEntries(LIMIT_FIELDS.map(([k]) => [k, form.limits[k] === "" ? null : Number(form.limits[k])]));
      const brand = Object.fromEntries(BRAND_FIELDS.map(([k]) => [k, form.brand[k]]) as [string, string][]);

      let code = form.code;
      if (form.plan === "pro") {
        const { data, error } = await insforge.functions.invoke("licencia-firmar", {
          body: { kind: form.kind, expiry: expiryMs ?? undefined, bot_slug: form.bot_slug ?? undefined, inst_uid: form.inst_uid ?? undefined, modules: form.modules },
        });
        if (error) throw error;
        code = (data as any)?.code ?? code;
      }

      const { error } = await insforge.database.from("licencias").update({
        plan: form.plan,
        kind: form.kind,
        expiry: expiryMs ? new Date(expiryMs).toISOString() : null,
        estado: form.estado,
        modules: form.modules,
        limits,
        brand,
        notas: form.notas,
        code,
      }).eq("id", form.id);
      if (error) throw error;

      // Refleja el plan en la instalación para que el panel del cliente lo
      // muestre al instante (antes quedaba en "free" hasta el próximo reporte).
      if (form.inst_uid) {
        await insforge.database.from("instalaciones").update({ tier: form.plan }).eq("uid", form.inst_uid);
      }

      await logAdmin("licencia.guardar", `${form.plan} · ${form.modules.length} módulos · ${form.estado}`);
      setFlash(t("admin.licencias.saved"));
      setLastCode(form.plan === "pro" && code ? code : null);
      setForm(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || t("admin.licencias.errSave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("admin.licencias.title")}</h1>
        <p className="text-sm text-muted">{t("admin.licencias.subtitle")}</p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {flash && <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{flash}</div>}

      {lastCode && (
        <div className="card p-4">
          <div className="mb-1 text-xs text-muted">{t("admin.licencias.codeForClient")}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[11px]">{lastCode}</code>
            <button className="btn-ghost" onClick={() => copyCode(lastCode)}>{t("admin.licencias.copy")}</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("admin.licencias.colClient")}</th>
              <th>{t("admin.licencias.colPlan")}</th>
              <th>{t("admin.licencias.colStatus")}</th>
              <th>{t("admin.licencias.colExpiry")}</th>
              <th>{t("admin.licencias.colModules")}</th>
              <th>{t("admin.licencias.colCode")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-muted">{t("common.loading")}</td>
              </tr>
            )}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-muted">{t("admin.licencias.empty")}</td>
              </tr>
            )}
            {rows.map((l) => (
              <tr key={l.id}>
                <td>
                  <div className="font-mono text-[12px]">{emails[l.user_id] ?? l.user_id.slice(0, 8)}</div>
                  <div className="text-[11px] text-muted">{l.bot_slug ?? "—"} · {l.inst_uid ?? t("admin.licencias.noUid")}</div>
                </td>
                <td>
                  <span className={`chip ${l.plan === "pro" ? "bg-accentSoft text-accent" : "bg-panel2 text-muted"}`}>{l.plan}</span>
                </td>
                <td>
                  <span className={`chip ${l.estado === "activa" ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"}`}>{l.estado}</span>
                </td>
                <td className="text-muted">{l.expiry ? formatDate(l.expiry) : l.kind === "lifetime" ? t("common.lifetime") : "—"}</td>
                <td className="text-muted">{(l.modules ?? []).length}</td>
                <td>
                  {l.plan === "pro" && l.code ? (
                    <button className="btn-ghost py-1" onClick={() => copyCode(l.code!)} title={l.code}>
                      {t("admin.licencias.copy")}
                    </button>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="text-right">
                  <button className="btn-ghost py-1" onClick={() => openEdit(l)}>{t("admin.licencias.edit")}</button>
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
              <h2 className="font-display text-lg font-semibold">{t("admin.licencias.editTitle")}</h2>
              <button className="text-muted hover:text-cream" onClick={() => setForm(null)}>✕</button>
            </div>

            {form.code && (
              <div className="mb-4">
                <label className="label">{t("admin.licencias.colCode")}</label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[11px]">{form.code}</code>
                  <button className="btn-ghost" onClick={() => copyCode(form.code!)}>{t("admin.licencias.copy")}</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t("admin.licencias.labelPlan")}</label>
                <select className="input mt-1" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as any })}>
                  <option value="free">free</option>
                  <option value="pro">pro</option>
                </select>
              </div>
              <div>
                <label className="label">{t("admin.licencias.labelStatus")}</label>
                <select className="input mt-1" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as any })}>
                  <option value="activa">activa</option>
                  <option value="revocada">revocada</option>
                  <option value="vencida">vencida</option>
                </select>
              </div>
              <div>
                <label className="label">{t("admin.licencias.labelKind")}</label>
                <select className="input mt-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as any })}>
                  <option value="lifetime">{t("common.lifetime")}</option>
                  <option value="monthly">{t("admin.licencias.kindMonthly")}</option>
                </select>
              </div>
              <div>
                <label className="label">{t("admin.licencias.labelExpiry")}</label>
                <input type="date" className="input mt-1" value={form.expiry} disabled={form.kind !== "monthly"} onChange={(e) => setForm({ ...form, expiry: e.target.value })} />
              </div>
            </div>

            <div className="mt-5">
              <label className="label">{t("admin.licencias.labelModules")}</label>
              <div className="mt-2 grid max-h-56 grid-cols-2 gap-2 overflow-auto rounded-lg border border-line bg-panel2 p-3">
                {mods.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.modules.includes(m.id)} onChange={() => toggleModule(m.id)} />
                    <span>{m.nombre}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {t("admin.licencias.selected", { n: form.modules.length })} · {form.modules.slice(0, 3).map((id) => modName[id] ?? id).join(", ")}
                {form.modules.length > 3 ? "…" : ""}
              </p>
            </div>

            <div className="mt-5">
              <label className="label">{t("admin.licencias.labelLimits")}</label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {LIMIT_FIELDS.map(([k, label]) => (
                  <div key={k}>
                    <div className="text-[11px] text-muted">{t(label)}</div>
                    <input type="number" className="input mt-1" value={form.limits[k]} placeholder="∞" onChange={(e) => setForm({ ...form, limits: { ...form.limits, [k]: e.target.value } })} />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="label">{t("admin.licencias.labelBrand")}</label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {BRAND_FIELDS.map(([k, label]) => (
                  <div key={k}>
                    <div className="text-[11px] text-muted">{t(label)}</div>
                    <input className="input mt-1" value={form.brand[k]} onChange={(e) => setForm({ ...form, brand: { ...form.brand, [k]: e.target.value } })} />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="label">{t("admin.licencias.labelNotes")}</label>
              <textarea className="input mt-1" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
              <button className="btn-primary" disabled={busy} onClick={save}>{busy ? t("common.saving") : t("admin.licencias.saveAndSign")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
