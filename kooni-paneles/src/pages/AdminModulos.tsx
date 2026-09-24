import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Modulo } from "../lib/types";

export default function AdminModulos() {
  const [mods, setMods] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await insforge.database.from("modulos_catalogo").select("*").order("orden", { ascending: true }).limit(200);
    if (error) setErr((error as any).message);
    setMods((data ?? []) as Modulo[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(id: string, fields: Partial<Modulo>) {
    setMods((ms) => ms.map((m) => (m.id === id ? { ...m, ...fields } : m)));
    const { error } = await insforge.database.from("modulos_catalogo").update(fields).eq("id", id);
    if (error) setErr((error as any).message);
  }

  const incluidas = mods.filter((m) => m.incluida).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Módulos</h1>
        <p className="text-sm text-muted">
          Catálogo de funciones. Marcá <b className="text-cream">Habilidad</b> (incluida en el plan base) o dejalo como{" "}
          <b className="text-cream">Superpoder</b> (de pago), y anotá qué requisito necesita.
        </p>
      </div>

      {err && <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}

      <div className="flex gap-3 text-xs text-muted">
        <span>{mods.length} módulos</span>
        <span>· {incluidas} habilidades base</span>
        <span>· {mods.length - incluidas} superpoderes</span>
      </div>

      <div className="card overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Tipo</th>
              <th>Habilidad base</th>
              <th>Requiere</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="text-muted">Cargando…</td></tr>
            )}
            {mods.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="font-medium">{m.nombre}</div>
                  <div className="font-mono text-[11px] text-muted">{m.id}</div>
                </td>
                <td><span className="chip bg-panel2 text-muted">{m.tipo}</span></td>
                <td>
                  <input type="checkbox" checked={m.incluida} onChange={(e) => patch(m.id, { incluida: e.target.checked })} />
                </td>
                <td>
                  <select
                    className="input py-1 text-xs"
                    value={m.requiere ?? ""}
                    onChange={(e) => patch(m.id, { requiere: e.target.value || null })}
                  >
                    <option value="">—</option>
                    <option value="google_review">Link de reseñas de Google</option>
                    <option value="stripe">Stripe / pago</option>
                    <option value="composio">Composio</option>
                    <option value="calcom">Cal.com</option>
                    <option value="whatsapp_hsm">Plantilla WhatsApp</option>
                  </select>
                </td>
                <td>
                  <input type="checkbox" checked={m.activo} onChange={(e) => patch(m.id, { activo: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
