import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Modulo } from "../lib/types";

export default function AdminModulos() {
  const [mods, setMods] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await insforge.database.from("modulos_catalogo").select("*").order("orden", { ascending: true }).limit(200);
      setMods((data ?? []) as Modulo[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Módulos</h1>
        <p className="text-sm text-muted">Catálogo de funciones que se pueden activar por licencia.</p>
      </div>
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Tipo</th>
              <th>Tab</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-muted">Cargando…</td>
              </tr>
            )}
            {mods.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="font-medium">{m.nombre}</div>
                  <div className="font-mono text-[11px] text-muted">{m.id}</div>
                </td>
                <td>
                  <span className="chip bg-panel2 text-muted">{m.tipo}</span>
                </td>
                <td className="font-mono text-[11px] text-muted">{m.tab ?? "—"}</td>
                <td className="max-w-lg text-muted">{m.descripcion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
