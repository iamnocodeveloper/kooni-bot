import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import { useI18n } from "../lib/i18n";

interface Accion {
  id: string;
  actor: string | null;
  accion: string;
  detalle: string | null;
  created_at: string;
}

export default function AdminAuditoria() {
  const { t, formatDate } = useI18n();
  const [rows, setRows] = useState<Accion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await insforge.database.from("auditoria_admin").select("*").order("created_at", { ascending: false }).limit(300);
      setRows((data ?? []) as Accion[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">{t("admin.auditoria.title")}</h1>
        <p className="text-sm text-muted">{t("admin.auditoria.subtitle")}</p>
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("admin.auditoria.colCuando")}</th>
              <th>{t("admin.auditoria.colQuien")}</th>
              <th>{t("admin.auditoria.colAccion")}</th>
              <th>{t("admin.auditoria.colDetalle")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="text-muted">{t("common.loading")}</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="text-muted">{t("admin.auditoria.empty")}</td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="font-mono text-[12px] text-muted">{formatDate(a.created_at, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="font-mono text-[12px]">{a.actor ?? "—"}</td>
                <td>{a.accion}</td>
                <td className="max-w-lg truncate text-muted">{a.detalle ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
