import { useEffect, useState } from "react";
import { insforge } from "../lib/insforge";
import type { Instalacion, Licencia, Uso } from "../lib/types";

const WEEK_MS = 7 * 86400000;

function Step({ cmd, note }: { cmd: string; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-accent">❯</span>
        <code className="rounded bg-panel2 px-2 py-1 font-mono text-[12.5px] text-accent">{cmd}</code>
      </div>
      <div className="pl-5 text-[11.5px] text-muted"># {note}</div>
    </div>
  );
}

function BotCard({ inst, uso }: { inst: Instalacion; uso?: Uso }) {
  const active = inst.last_seen && Date.now() - new Date(inst.last_seen).getTime() < WEEK_MS;
  const pro = inst.tier === "pro";
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{inst.bot_name ?? inst.slug ?? "Bot"}</div>
          <div className="font-mono text-[11px] text-muted">{inst.uid ?? "—"}</div>
        </div>
        <span className={`chip ${active ? "bg-ok/15 text-ok" : "bg-panel2 text-muted"}`}>
          {active ? "● Activo" : "○ Offline"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-line bg-panel2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted">Mensajes 30d</div>
          <div className="font-mono text-sm">{uso?.conteos?.mensajes30?.toLocaleString("es") ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-line bg-panel2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted">Leads 30d</div>
          <div className="font-mono text-sm">{uso?.conteos?.leads30?.toLocaleString("es") ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-line bg-panel2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted">IA 30d</div>
          <div className="font-mono text-sm">{uso?.costos?.ia30 != null ? `$${Number(uso.costos.ia30).toFixed(2)}` : "—"}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className={`chip ${pro ? "bg-accentSoft text-accent" : "bg-panel2 text-muted"}`}>{inst.tier ?? "free"}</span>
        <span className="text-[11px] text-muted">{inst.last_seen ? `visto ${new Date(inst.last_seen).toLocaleDateString("es")}` : "—"}</span>
        {inst.worker_url ? (
          <a className="btn-ghost py-1 text-xs" href={`${inst.worker_url}/admin`} target="_blank" rel="noreferrer">
            Abrir panel
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function Cuenta() {
  const [lics, setLics] = useState<Licencia[]>([]);
  const [insts, setInsts] = useState<Instalacion[]>([]);
  const [uso, setUso] = useState<Map<string, Uso>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [lic, inst, usos] = await Promise.all([
        insforge.database.from("licencias").select("id, plan, kind, expiry, estado, modules, bot_slug, inst_uid").order("created_at", { ascending: false }).limit(50),
        insforge.database.from("instalaciones").select("id, user_id, uid, slug, worker_url, bot_name, tier, last_seen, created_at").order("last_seen", { ascending: false }).limit(50),
        insforge.database.from("uso_instalaciones").select("id, instalacion_id, fecha, conteos, costos").order("fecha", { ascending: false }).limit(200),
      ]);
      setLics((lic.data ?? []) as Licencia[]);
      setInsts((inst.data ?? []) as Instalacion[]);
      const latest = new Map<string, Uso>();
      for (const u of (usos.data ?? []) as Uso[]) if (!latest.has(u.instalacion_id)) latest.set(u.instalacion_id, u);
      setUso(latest);
      setLoading(false);
    })();
  }, []);

  const pro = lics.find((l) => l.plan === "pro" && l.estado !== "revocada");
  const hasBots = insts.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Mis bots</h1>
        <p className="text-sm text-muted">Tu plan y tus bots, con sus métricas al día.</p>
      </div>

      <div className="card p-5">
        {loading ? (
          <div className="text-muted">Cargando…</div>
        ) : pro ? (
          <div className="flex items-center gap-3">
            <span className="chip bg-accentSoft text-accent">● PLAN PRO</span>
            <span className="text-sm text-muted">
              {pro.expiry ? `vence el ${new Date(pro.expiry).toLocaleDateString("es")}` : "de por vida"} · {pro.modules?.length ?? 0} módulos activos
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="chip bg-panel2 text-muted">○ PLAN GRATIS</span>
            <span className="text-sm text-muted">Activá Pro para quitar los límites y desbloquear módulos.</span>
          </div>
        )}
      </div>

      {loading ? null : hasBots ? (
        <div className="grid gap-4 md:grid-cols-2">
          {insts.map((i) => (
            <BotCard key={i.id} inst={i} uso={uso.get(i.id)} />
          ))}
        </div>
      ) : (
        <div className="card flex flex-col gap-4 p-6">
          <div>
            <div className="font-semibold">Sin bots todavía</div>
            <p className="text-sm text-muted">Conectá tu primer bot en 2 pasos.</p>
          </div>
          <Step cmd="npx kooni-bot init" note="tu agente (Claude Code o Codex) construye y publica el bot" />
          <Step cmd="npx kooni-bot login" note="entrá con esta misma cuenta — el pairing es automático" />
          <p className="text-[12.5px] text-muted">
            Al desplegar con el CLI ya logueado, el bot se registra solo bajo tu cuenta y aparece aquí con sus métricas.
          </p>
        </div>
      )}

      {!loading && !pro && (
        <div className="card p-5">
          <div className="font-semibold">Kooni+</div>
          <p className="mt-1 text-sm text-muted">
            Encendé los superpoderes, desbloqueá las plantillas por giro y administrá varios clientes — todo en un plan.
          </p>
        </div>
      )}
    </div>
  );
}
