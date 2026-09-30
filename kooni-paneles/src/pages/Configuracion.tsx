import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import LanguageSelect from "../components/LanguageSelect";
import type { Colaborador } from "../lib/types";

const MAX = 3;

export default function Configuracion() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [cols, setCols] = useState<Colaborador[]>([]);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [puedeEditar, setPuedeEditar] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      setErr(t("config.errEmail"));
      return;
    }
    if (lleno) {
      setErr(t("config.errMax", { n: MAX }));
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
    setFlash(t("config.created"));
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
        <h1 className="font-display text-xl font-semibold">{t("config.title")}</h1>
        <p className="text-sm text-muted">{t("config.subtitle")}</p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      {flash && <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{flash}</div>}

      <div className="card p-5">
        <div className="font-semibold">{t("config.langTitle")}</div>
        <p className="mt-1 text-sm text-muted">{t("config.langDesc")}</p>
        <div className="mt-3 max-w-xs">
          <label className="label">{t("config.langLabel")}</label>
          <LanguageSelect className="mt-1 w-full" />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">{t("config.teamTitle")}</div>
            <p className="mt-1 text-sm text-muted">
              {t("config.teamDescPre")} <b className="text-cream">{t("config.teamMax", { n: MAX })}</b>.
            </p>
          </div>
          <span className="chip bg-panel2 text-muted">{activos.length}/{MAX}</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="label">{t("config.forWhom")}</label>
            <input className="input mt-1" placeholder={t("config.forWhomPlaceholder")} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("login.email")}</label>
            <input className="input mt-1" type="email" placeholder={t("config.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 pb-2 text-xs text-muted">
              <input type="checkbox" checked={puedeEditar} onChange={(e) => setPuedeEditar(e.target.checked)} />
              {t("config.canEdit")}
            </label>
            <button className="btn-primary mb-1" disabled={lleno} onClick={invitar}>{t("config.createInvite")}</button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-line">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("config.col.collaborator")}</th>
                <th>{t("config.col.status")}</th>
                <th>{t("config.col.permission")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="text-muted">{t("common.loading")}</td>
                </tr>
              )}
              {!loading && cols.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">{t("config.empty")}</td>
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
                  <td className="text-muted">{c.puede_editar ? t("config.canEditShort") : t("config.readOnly")}</td>
                  <td className="text-right">
                    {c.estado !== "activo" && (
                      <button className="btn-ghost py-1 mr-2 text-xs" onClick={() => copiar(c)}>
                        {copiedId === c.id ? t("common.copied") : t("config.copyLink")}
                      </button>
                    )}
                    <button className="btn-danger py-1 text-xs" onClick={() => revocar(c.id)}>{t("common.revoke")}</button>
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
