import type { Env } from "../env";
import { Db } from "../db/client";
import { costOfUsage } from "../pricing";

// Los 6 reportes del nicho TAXIS (una sola pantalla). Misma regla de diseño que
// restaurante: CADA reporte termina en una ACCIÓN sugerida, no en un número.
// Todo filtrable por rango de fechas; el mismo builder alimenta la vista y el CSV.

export interface ReportWindow {
  from: number; // epoch ms, inclusivo
  to: number; // epoch ms, exclusivo
}

const DAY = 86_400_000;

function pctDelta(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function money(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
}

export interface TaxiReports {
  window: ReportWindow;
  prevWindow: ReportWindow;
  viajes: {
    total: number;
    prev: number;
    deltaPct: number | null;
    byDay: { day: string; total: number }[];
    completados: number;
    cancelados: number;
    sinConductor: number;
    action: string;
  };
  bases: { rows: { name: string; trips: number; revenue: number }[]; action: string };
  conductores: { rows: { name: string; trips: number; revenue: number }[]; action: string };
  zonas: { rows: { zone: string; n: number }[]; action: string };
  tarifas: { total: number; avg: number; action: string };
  salud: {
    convsConViaje: number;
    convsTotal: number;
    conversionPct: number | null;
    viajesBot: number;
    viajesSinHumano: number;
    abandonadas: number;
    costoIA: number;
    costoPorViaje: number | null;
    action: string;
  };
}

export async function buildTaxiReports(env: Env, win: ReportWindow): Promise<TaxiReports> {
  const db = new Db(env.DB);
  const span = Math.max(win.to - win.from, DAY);
  const prev: ReportWindow = { from: win.from - span, to: win.from };
  const q = "status != 'cancelado' AND created_at >= ? AND created_at < ?";

  // ── 1. VIAJES ──────────────────────────────────────────────────────────────
  const totalCur = (await db.first<{ n: number }>(
    `SELECT COUNT(*) as n FROM taxi_trips WHERE ${q}`,
    [win.from, win.to],
  ))?.n ?? 0;
  const totalPrev = (await db.first<{ n: number }>(
    `SELECT COUNT(*) as n FROM taxi_trips WHERE ${q}`,
    [prev.from, prev.to],
  ))?.n ?? 0;
  const byDay = await db.all<{ day: string; total: number }>(
    `SELECT date(created_at/1000,'unixepoch') as day, COUNT(*) as total
     FROM taxi_trips WHERE ${q} GROUP BY day ORDER BY day ASC`,
    [win.from, win.to],
  );
  const completados = (await db.first<{ n: number }>(
    "SELECT COUNT(*) as n FROM taxi_trips WHERE status = 'completado' AND created_at >= ? AND created_at < ?",
    [win.from, win.to],
  ))?.n ?? 0;
  const cancelados = (await db.first<{ n: number }>(
    "SELECT COUNT(*) as n FROM taxi_trips WHERE status = 'cancelado' AND created_at >= ? AND created_at < ?",
    [win.from, win.to],
  ))?.n ?? 0;
  const sinConductor = (await db.first<{ n: number }>(
    "SELECT COUNT(*) as n FROM taxi_trips WHERE status = 'sin_conductor' AND created_at >= ? AND created_at < ?",
    [win.from, win.to],
  ))?.n ?? 0;
  const delta = pctDelta(totalCur, totalPrev);
  const viajesAction =
    delta === null
      ? "Todavía no hay con qué comparar. En unas semanas vas a ver si sube o baja la demanda."
      : delta < -10
        ? `Los viajes bajaron ${Math.abs(delta)}% vs. el período anterior. Revisá si hubo horas sin conductores en cola o el bot fuera de servicio.`
        : delta > 10
          ? `Los viajes subieron ${delta}%. Fijate qué horas jalaron para tener más autos en la calle ahí.`
          : `Demanda estable (${delta >= 0 ? "+" : ""}${delta}%). Para moverla, probá una promo en las horas flojas.`;

  // ── 2. POR BASE ────────────────────────────────────────────────────────────
  const bases = await db.all<{ name: string; trips: number; revenue: number }>(
    `SELECT COALESCE(b.name, '(sin base)') as name, COUNT(*) as trips, COALESCE(SUM(t.fare_estimate),0) as revenue
     FROM taxi_trips t LEFT JOIN taxi_bases b ON b.id = t.base_id
     WHERE t.status = 'completado' AND t.created_at >= ? AND t.created_at < ?
     GROUP BY t.base_id ORDER BY trips DESC`,
    [win.from, win.to],
  );
  const basesAction =
    bases.length > 1
      ? `La base "${bases[0].name}" atendió ${bases[0].trips} viajes (la más activa). Si otra quedó muy abajo, revisá su cola y sus zonas.`
      : bases.length === 1
        ? `Todos los viajes salieron de "${bases[0].name}". Si tenés más bases, cargalas en Bases para repartir la demanda.`
        : "Cargá tus bases en Bases para ver el reparto de viajes.";

  // ── 3. CONDUCTORES ─────────────────────────────────────────────────────────
  const conductores = await db.all<{ name: string; trips: number; revenue: number }>(
    `SELECT COALESCE(d.name, d.code, '(conductor borrado)') as name, COUNT(*) as trips, COALESCE(SUM(t.fare_estimate),0) as revenue
     FROM taxi_trips t LEFT JOIN taxi_drivers d ON d.id = t.driver_id
     WHERE t.status = 'completado' AND t.driver_id IS NOT NULL AND t.created_at >= ? AND t.created_at < ?
     GROUP BY t.driver_id ORDER BY trips DESC LIMIT 10`,
    [win.from, win.to],
  );
  const conductoresAction =
    conductores.length > 1
      ? `El más activo fue ${conductores[0].name} (${conductores[0].trips} viajes). Repartí la cola para que no se queme uno solo.`
      : conductores.length === 1
        ? `Casi todo lo hizo ${conductores[0].name}. Cargá más conductores para tener respaldo.`
        : "Sin viajes completados por conductor en el período.";

  // ── 4. DEMANDA POR ZONA ────────────────────────────────────────────────────
  const zonas = await db.all<{ zone: string; n: number }>(
    `SELECT zone, COUNT(*) as n FROM taxi_trips
     WHERE status != 'cancelado' AND zone IS NOT NULL AND zone <> '' AND created_at >= ? AND created_at < ?
     GROUP BY zone ORDER BY n DESC LIMIT 8`,
    [win.from, win.to],
  );
  const zonasAction =
    zonas.length > 0
      ? `La zona con más pedidos es "${zonas[0].zone}". Asegurate de tener autos cerca en esa franja.`
      : "Cargá las zonas por base en Bases para ver de dónde viene la demanda.";

  // ── 5. TARIFAS / INGRESOS ESTIMADOS ────────────────────────────────────────
  const tarifaTotal = (await db.first<{ n: number }>(
    `SELECT COALESCE(SUM(fare_estimate),0) as n FROM taxi_trips WHERE ${q}`,
    [win.from, win.to],
  ))?.n ?? 0;
  const tarifaAvg = (await db.first<{ n: number | null }>(
    `SELECT AVG(fare_estimate) as n FROM taxi_trips WHERE ${q} AND fare_estimate IS NOT NULL`,
    [win.from, win.to],
  ))?.n ?? 0;
  const tarifasAction =
    tarifaTotal > 0
      ? `Ingreso estimado ${money(tarifaTotal)} (promedio ${money(tarifaAvg ?? 0)} por viaje). Es un ESTIMADO: la tarifa por zona se carga en Bases.`
      : "Cargá tarifa base y tarifas por zona en Bases para estimar ingresos.";

  // ── 6. SALUD DEL BOT ───────────────────────────────────────────────────────
  const convsConViaje = (await db.first<{ n: number }>(
    "SELECT COUNT(DISTINCT conversation_id) as n FROM taxi_trips WHERE conversation_id IS NOT NULL AND created_at >= ? AND created_at < ?",
    [win.from, win.to],
  ))?.n ?? 0;
  const convsTotal = (await db.first<{ n: number }>(
    "SELECT COUNT(*) as n FROM conversations WHERE started_at >= ? AND started_at < ?",
    [win.from, win.to],
  ))?.n ?? 0;
  const viajesBot = (await db.first<{ n: number }>(
    `SELECT COUNT(*) as n FROM taxi_trips WHERE conversation_id IS NOT NULL AND ${q}`,
    [win.from, win.to],
  ))?.n ?? 0;
  const viajesSinHumano = (await db.first<{ n: number }>(
    `SELECT COUNT(*) as n FROM taxi_trips t
     WHERE t.conversation_id IS NOT NULL AND t.status != 'cancelado'
       AND t.created_at >= ? AND t.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM tickets tk WHERE tk.conversation_id = t.conversation_id)`,
    [win.from, win.to],
  ))?.n ?? 0;
  const abandonadas = (await db.first<{ n: number }>(
    `SELECT COUNT(*) as n FROM conversation_insights ci
     JOIN conversations c ON c.id = ci.conversation_id
     WHERE ci.resolution = 'abandoned' AND c.started_at >= ? AND c.started_at < ?`,
    [win.from, win.to],
  ))?.n ?? 0;
  const usage = await db.all<{ model_used: string; i: number; o: number; c: number }>(
    `SELECT model_used,
            SUM(COALESCE(input_tokens,0)) as i,
            SUM(COALESCE(output_tokens,0)) as o,
            SUM(COALESCE(cached_input_tokens,0)) as c
     FROM messages WHERE created_at >= ? AND created_at < ? GROUP BY model_used`,
    [win.from, win.to],
  );
  const costoIA = usage.reduce(
    (s, r) => s + costOfUsage(r.model_used || "haiku", { input: r.i, cached: r.c, output: r.o }),
    0,
  );
  const conversionPct = convsTotal > 0 ? Math.round((convsConViaje / convsTotal) * 100) : null;
  const costoPorViaje = viajesBot > 0 ? costoIA / viajesBot : null;
  const saludAction =
    viajesBot === 0
      ? "El bot todavía no cerró viajes. Verificá que las bases y los conductores estén cargados."
      : `El bot registró ${viajesBot} viaje${viajesBot === 1 ? "" : "s"} este período, ${viajesSinHumano} sin que interviniera nadie` +
        `${sinConductor > 0 ? `, y ${sinConductor} quedaron sin conductor` : ""}. ` +
        `Gastó ${money(costoIA)} en IA${costoPorViaje !== null ? ` (${money(costoPorViaje)} por viaje)` : ""}.` +
        `${abandonadas > 0 ? ` ${abandonadas} conversación${abandonadas === 1 ? "" : "es"} quedó sin cerrar.` : ""}`;

  return {
    window: win,
    prevWindow: prev,
    viajes: { total: totalCur, prev: totalPrev, deltaPct: delta, byDay, completados, cancelados, sinConductor, action: viajesAction },
    bases: { rows: bases, action: basesAction },
    conductores: { rows: conductores, action: conductoresAction },
    zonas: { rows: zonas, action: zonasAction },
    tarifas: { total: tarifaTotal, avg: tarifaAvg ?? 0, action: tarifasAction },
    salud: { convsConViaje, convsTotal, conversionPct, viajesBot, viajesSinHumano, abandonadas, costoIA, costoPorViaje, action: saludAction },
  };
}

/** CSV plano de los reportes (una sección por reporte). */
export function reportsToCsv(r: TaxiReports): string {
  const rows: string[][] = [];
  const push = (...cells: (string | number)[]) => rows.push(cells.map((c) => String(c)));
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

  push("REPORTE", "métrica", "valor");
  push("Viajes", "total período", r.viajes.total);
  push("Viajes", "período anterior", r.viajes.prev);
  push("Viajes", "variación %", r.viajes.deltaPct ?? "");
  push("Viajes", "completados", r.viajes.completados);
  push("Viajes", "cancelados", r.viajes.cancelados);
  push("Viajes", "sin conductor", r.viajes.sinConductor);
  for (const d of r.viajes.byDay) push("Viajes por día", d.day, d.total);
  for (const b of r.bases.rows) push("Por base", b.name, `${b.trips} viajes · ${b.revenue}`);
  for (const c of r.conductores.rows) push("Conductores", c.name, `${c.trips} viajes · ${c.revenue}`);
  for (const z of r.zonas.rows) push("Demanda por zona", z.zone, z.n);
  push("Tarifas (estimado)", "ingreso período", r.tarifas.total);
  push("Tarifas (estimado)", "promedio por viaje", r.tarifas.avg);
  push("Salud del bot", "conversaciones con viaje", r.salud.convsConViaje);
  push("Salud del bot", "conversaciones totales", r.salud.convsTotal);
  push("Salud del bot", "viajes por el bot", r.salud.viajesBot);
  push("Salud del bot", "viajes sin intervención humana", r.salud.viajesSinHumano);
  push("Salud del bot", "conversaciones abandonadas", r.salud.abandonadas);
  push("Salud del bot", "costo IA del período", r.salud.costoIA);

  return rows.map((row) => row.map(esc).join(",")).join("\n");
}
