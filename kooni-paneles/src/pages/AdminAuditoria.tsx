import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";

interface Accion {
  id: string;
  actor: string | null;
  accion: string;
  detalle: string | null;
  created_at: string;
}

export default function AdminAuditoria() {
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
        <h1 className="font-display text-xl font-semibold">Auditoría</h1>
        <p className="text-sm text-muted">Cada acción sensible del super admin: quién, qué y cuándo.</p>
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Cuándo</th>
              <th>Quién</th>
              <th>Acción</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="text-muted">Cargando…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="text-muted">Sin acciones registradas.</td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="font-mono text-[12px] text-muted">{new Date(a.created_at).toLocaleString("es")}</td>
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
