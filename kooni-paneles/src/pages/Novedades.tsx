import { useEffect, useMemo, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Novedad } from "../lib/types";

const TIPO: Record<string, { label: string; cls: string }> = {
  nuevo: { label: "Nuevo", cls: "bg-accentSoft text-accent" },
  mejora: { label: "Mejora", cls: "bg-warn/15 text-warn" },
  arreglo: { label: "Arreglo", cls: "bg-bad/15 text-bad" },
};

export default function Novedades() {
  const [items, setItems] = useState<Novedad[]>([]);
  const [filtro, setFiltro] = useState<"todas" | "kooni" | "kooni+">("todas");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await insforge.database
        .from("novedades")
        .select("*")
        .eq("visible", true)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      setItems((data ?? []) as Novedad[]);
      setLoading(false);
    })();
  }, []);

  const list = useMemo(
    () => (filtro === "todas" ? items : items.filter((i) => i.origen === filtro)),
    [items, filtro],
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Novedades</h1>
        <p className="text-sm text-muted">
          Todo lo que va saliendo, con sus notas y cómo activarlo. Para tener lo último en tu bot, corré
          <code className="mx-1 text-accent">npx kooni-bot update</code> — tu configuración y tus datos se conservan.
        </p>
      </div>

      <div className="flex gap-2">
        {(["todas", "kooni", "kooni+"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`chip ${filtro === f ? "bg-accentSoft text-accent" : "bg-panel2 text-muted"}`}
          >
            {f === "todas" ? "Todas" : f === "kooni" ? "Kooni" : "Kooni+"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted">Cargando…</div>
      ) : list.length === 0 ? (
        <div className="card p-6 text-sm text-muted">Todavía no hay novedades publicadas.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((n) => {
            const t = TIPO[n.tipo] ?? TIPO.nuevo;
            return (
              <div key={n.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="font-mono">{new Date(n.fecha + "T00:00:00").toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  {n.version ? <span className="font-mono">· {n.version}</span> : null}
                  <span className={`chip ${t.cls}`}>{t.label}</span>
                  {n.origen === "kooni+" ? <span className="chip bg-panel2 text-muted">Kooni+</span> : null}
                </div>
                <div className="mt-2 font-semibold">{n.titulo}</div>
                {n.cuerpo ? <p className="mt-1 text-sm text-muted">{n.cuerpo}</p> : null}
                {n.update_hint ? (
                  <div className="mt-2 font-mono text-[11.5px] text-muted">{n.update_hint}</div>
                ) : null}
                {n.cta_label && n.cta_url ? (
                  <a className="mt-3 inline-block text-sm text-accent hover:underline" href={n.cta_url} target="_blank" rel="noreferrer">
                    {n.cta_label} →
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
