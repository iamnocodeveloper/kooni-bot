import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";
import type { Faq, SoporteMensaje } from "../lib/types";

export default function AdminSoporte() {
  const { t, formatDate } = useI18n();
  const [msgs, setMsgs] = useState<SoporteMensaje[]>([]);
  const [faq, setFaq] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const [ms, fq] = await Promise.all([
      insforge.database.from("soporte_mensajes").select("*").order("created_at", { ascending: false }).limit(200),
      insforge.database.from("faq").select("*").order("orden", { ascending: true }).limit(100),
    ]);
    setMsgs((ms.data ?? []) as SoporteMensaje[]);
    setFaq((fq.data ?? []) as Faq[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function setEstado(id: string, estado: SoporteMensaje["estado"]) {
    const { error } = await insforge.database.from("soporte_mensajes").update({ estado }).eq("id", id);
    if (error) setErr((error as any).message);
    await load();
  }

  async function patchFaq(id: string, fields: Partial<Faq>) {
    setFaq((rs) => rs.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    const { error } = await insforge.database.from("faq").update(fields).eq("id", id);
    if (error) setErr((error as any).message);
  }

  const estadoCls = (s: string) =>
    s === "nuevo" ? "bg-warn/15 text-warn" : s === "respondido" ? "bg-ok/15 text-ok" : "bg-panel2 text-muted";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("admin.soporte.title")}</h1>
        <p className="text-sm text-muted">{t("admin.soporte.subtitle")}</p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("admin.soporte.colFecha")}</th>
              <th>{t("admin.soporte.colDe")}</th>
              <th>{t("admin.soporte.colAsunto")}</th>
              <th>{t("admin.soporte.colEstado")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="text-muted">{t("common.loading")}</td></tr>
            )}
            {!loading && msgs.length === 0 && (
              <tr><td colSpan={4} className="text-muted">{t("admin.soporte.empty")}</td></tr>
            )}
            {msgs.map((m) => (
              <tr key={m.id}>
                <td className="font-mono text-[12px] text-muted">{formatDate(m.created_at)}</td>
                <td className="font-mono text-[12px]">{m.email ?? "—"}</td>
                <td>
                  <div className="font-medium">{m.asunto}</div>
                  <div className="max-w-lg truncate text-muted">{m.mensaje}</div>
                </td>
                <td>
                  <select className="input py-1 text-xs" value={m.estado} onChange={(e) => setEstado(m.id, e.target.value as any)}>
                    <option value="nuevo">{t("admin.soporte.statusNuevo")}</option>
                    <option value="leido">{t("admin.soporte.statusLeido")}</option>
                    <option value="respondido">{t("admin.soporte.statusRespondido")}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-display font-semibold text-[13px] text-cream">{t("admin.soporte.faqTitle")}</h3>
        <div className="card flex flex-col gap-3 p-5">
          {faq.map((f) => (
            <div key={f.id} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
              <input className="input text-[13px]" value={f.pregunta} onChange={(e) => patchFaq(f.id, { pregunta: e.target.value })} />
              <textarea className="input text-[12.5px]" rows={2} value={f.respuesta} onChange={(e) => patchFaq(f.id, { respuesta: e.target.value })} />
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={f.activo} onChange={(e) => patchFaq(f.id, { activo: e.target.checked })} />
                {t("admin.soporte.visible")}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
