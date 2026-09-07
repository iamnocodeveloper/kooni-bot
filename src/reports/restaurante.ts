import type { Env } from "../env";
import { Db } from "../db/client";
import { costOfUsage } from "../pricing";

// Los 6 reportes del nicho RESTAURANTE (una sola pantalla). Regla de diseño:
// CADA reporte termina en una ACCIÓN sugerida, no en un número.
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

export interface RestaurantReports {
  window: ReportWindow;
  prevWindow: ReportWindow;
  ventas: {
    total: number;
    prev: number;
    deltaPct: number | null;
    byDay: { day: string; total: number }[];
    pedidos: number;
    cancelados: number;
    action: string;
  };
  ticket: { avg: number; prevAvg: number; deltaPct: number | null; action: string };
  productos: {
    top: { name: string; units: number; revenue: number }[];
    sinVenta: string[];
    action: string;
  };
  pico: { cells: { dow: number; hour: number; n: number }[]; topLabel: string | null; action: string };
  clientes: {
    nuevos: number;
    recurrentes: number;
    top: { name: string | null; phone: string; orders: number; total: number }[];
    dejaron: { name: string | null; phone: string; total: number; lastAt: number }[];
    dejaronMonto: number;
    action: string;
  };
  salud: {
    convsConPedido: number;
    convsTotal: number;
    conversionPct: number | null;
    pedidosSinHumano: number;
    pedidosBot: number;
    abandonadas: number;
    costoIA: number;
    costoPorPedido: number | null;
    action: string;
  };
}

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export async function buildRestaurantReports(env: Env, win: ReportWindow): Promise<RestaurantReports> {
  const db = new Db(env.DB);
  const span = Math.max(win.to - win.from, DAY);
  const prev: ReportWindow = { from: win.from - span, to: win.from };
  const q = "status != 'cancelado' AND created_at >= ? AND created_at < ?";

  // ── 1. VENTAS ──────────────────────────────────────────────────────────────
  const ventasCur = (await db.first<{ n: number }>(
    `SELECT COALESCE(SUM(total),0) as n FROM orders WHERE ${q}`,
    [win.from, win.to],
  ))?.n ?? 0;
  const ventasPrev = (await db.first<{ n: number }>(
    `SELECT COALESCE(SUM(total),0) as n FROM orders WHERE ${q}`,
    [prev.from, prev.to],
  ))?.n ?? 0;
  const byDay = await db.all<{ day: string; total: number }>(
    `SELECT date(created_at/1000,'unixepoch') as day, SUM(total) as total
     FROM orders WHERE ${q} GROUP BY day ORDER BY day ASC`,
    [win.from, win.to],
  );
  const pedidos = (await db.first<{ n: number }>(
    `SELECT COUNT(*) as n FROM orders WHERE ${q}`,
    [win.from, win.to],
  ))?.n ?? 0;
  const cancelados = (await db.first<{ n: number }>(
    "SELECT COUNT(*) as n FROM orders WHERE status = 'cancelado' AND created_at >= ? AND created_at < ?",
    [win.from, win.to],
  ))?.n ?? 0;
  const ventasDelta = pctDelta(ventasCur, ventasPrev);
  const ventasAction =
    ventasDelta === null
      ? "Todavía no hay con qué comparar. En unas semanas vas a ver si subís o bajás."
      : ventasDelta < -10
        ? `Las ventas bajaron ${Math.abs(ventasDelta)}% vs. el período anterior. Revisá si hubo días sin cobertura, productos agotados o el bot fuera de servicio.`
        : ventasDelta > 10
          ? `Las ventas subieron ${ventasDelta}%. Fijate qué días/horas jalaron para reforzar cocina y reparto ahí.`
          : `Ventas estables (${ventasDelta >= 0 ? "+" : ""}${ventasDelta}%). Para moverlas, probá una promo en el día más flojo.`;
  const cancelPct = pedidos + cancelados > 0 ? Math.round((cancelados / (pedidos + cancelados)) * 100) : 0;

  // ── 2. TICKET PROMEDIO ─────────────────────────────────────────────────────
  const tAvg = (await db.first<{ n: number | null }>(
    `SELECT AVG(total) as n FROM orders WHERE ${q}`,
    [win.from, win.to],
  ))?.n ?? 0;
  const tPrev = (await db.first<{ n: number | null }>(
    `SELECT AVG(total) as n FROM orders WHERE ${q}`,
    [prev.from, prev.to],
  ))?.n ?? 0;
  const tDelta = pctDelta(tAvg ?? 0, tPrev ?? 0);
  const ticketAction =
    (tAvg ?? 0) === 0
      ? "Sin pedidos en el período."
      : `Ticket promedio ${money(tAvg ?? 0)}${tDelta !== null ? ` (${tDelta >= 0 ? "+" : ""}${tDelta}% vs. antes)` : ""}. ` +
        `Para subirlo: un combo, una bebida sugerida o un postre al cierre del pedido — configuralo en el playbook del bot.`;

  // ── 3. PRODUCTOS ───────────────────────────────────────────────────────────
  const top = await db.all<{ name: string; units: number; revenue: number }>(
    `SELECT oi.name as name, SUM(oi.qty) as units, SUM(oi.qty * oi.unit_price) as revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status != 'cancelado' AND o.created_at >= ? AND o.created_at < ?
     GROUP BY oi.name ORDER BY units DESC LIMIT 10`,
    [win.from, win.to],
  );
  const sinVenta = (
    await db.all<{ name: string }>(
      `SELECT name FROM products
       WHERE active = 1 AND name NOT IN (
         SELECT DISTINCT oi.name FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.status != 'cancelado' AND o.created_at >= ?
       ) ORDER BY name LIMIT 20`,
      [win.from],
    )
  ).map((r) => r.name);
  const productosAction =
    sinVenta.length > 0
      ? `${sinVenta.length} producto${sinVenta.length === 1 ? "" : "s"} del menú no se vendió en el período: ${sinVenta.slice(0, 6).join(", ")}${sinVenta.length > 6 ? "…" : ""}. Considerá sacarlos, cambiarles el precio o ponerlos en promo.`
      : top.length > 0
        ? `"${top[0].name}" es tu producto estrella (${top[0].units} u.). Ofrecelo como combo o destacalo en el menú.`
        : "Cargá el menú en Menú para ver qué rota y qué no.";

  // ── 4. HORAS Y DÍAS PICO ───────────────────────────────────────────────────
  const cells = await db.all<{ dow: number; hour: number; n: number }>(
    `SELECT CAST(strftime('%w', created_at/1000, 'unixepoch') AS INTEGER) as dow,
            CAST(strftime('%H', created_at/1000, 'unixepoch') AS INTEGER) as hour,
            COUNT(*) as n
     FROM orders WHERE ${q} GROUP BY dow, hour`,
    [win.from, win.to],
  );
  const peak = cells.reduce<{ dow: number; hour: number; n: number } | null>(
    (m, c) => (!m || c.n > m.n ? c : m),
    null,
  );
  const topLabel = peak ? `${DOW[peak.dow]} ${peak.hour}:00–${peak.hour + 1}:00` : null;
  const picoAction = topLabel
    ? `Tu pico es ${topLabel} (${peak!.n} pedidos). Asegurate de tener cocina y repartidor listos en esa franja; es cuando más se cae una venta por demora.`
    : "Sin datos suficientes para el mapa de calor todavía.";

  // ── 5. CLIENTES ────────────────────────────────────────────────────────────
  const now = win.to;
  const monthAgo = now - 30 * DAY;
  const twoMonthsAgo = now - 60 * DAY;
  const byCustomer = await db.all<{
    phone: string;
    name: string | null;
    orders: number;
    total: number;
    first_at: number;
    last_at: number;
  }>(
    `SELECT customer_phone as phone, MAX(customer_name) as name,
            COUNT(*) as orders, SUM(total) as total,
            MIN(created_at) as first_at, MAX(created_at) as last_at
     FROM orders
     WHERE status != 'cancelado' AND customer_phone IS NOT NULL AND customer_phone <> ''
     GROUP BY customer_phone`,
  );
  const nuevos = byCustomer.filter((c) => c.first_at >= win.from && c.first_at < win.to).length;
  const recurrentes = byCustomer.filter((c) => c.orders > 1).length;
  const topClientes = [...byCustomer]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((c) => ({ name: c.name, phone: c.phone, orders: c.orders, total: c.total }));
  const dejaron = byCustomer
    .filter((c) => c.orders >= 2 && c.last_at < monthAgo && c.last_at >= twoMonthsAgo)
    .sort((a, b) => b.total - a.total)
    .map((c) => ({ name: c.name, phone: c.phone, total: c.total, lastAt: c.last_at }));
  const dejaronMonto = dejaron.reduce((s, c) => s + c.total, 0);
  const clientesAction =
    dejaron.length > 0
      ? `${dejaron.length} cliente${dejaron.length === 1 ? "" : "s"} que pedía${dejaron.length === 1 ? "" : "n"} seguido no pide hace 30–60 días — ${money(dejaronMonto)} en compras que se están yendo. Mandales un mensaje con una promo desde Campañas.`
      : recurrentes > 0
        ? `Tenés ${recurrentes} cliente${recurrentes === 1 ? "" : "s"} recurrente${recurrentes === 1 ? "" : "s"}. Un descuento por 3.ª compra los fideliza.`
        : "Todavía no hay clientes que repitan. Un cupón para el próximo pedido al entregar ayuda a que vuelvan.";

  // ── 6. SALUD DEL BOT ───────────────────────────────────────────────────────
  const convsConPedido = (await db.first<{ n: number }>(
    "SELECT COUNT(DISTINCT conversation_id) as n FROM orders WHERE conversation_id IS NOT NULL AND created_at >= ? AND created_at < ?",
    [win.from, win.to],
  ))?.n ?? 0;
  const convsTotal = (await db.first<{ n: number }>(
    "SELECT COUNT(*) as n FROM conversations WHERE started_at >= ? AND started_at < ?",
    [win.from, win.to],
  ))?.n ?? 0;
  const pedidosBot = (await db.first<{ n: number }>(
    `SELECT COUNT(*) as n FROM orders WHERE conversation_id IS NOT NULL AND ${q}`,
    [win.from, win.to],
  ))?.n ?? 0;
  const pedidosSinHumano = (await db.first<{ n: number }>(
    `SELECT COUNT(*) as n FROM orders o
     WHERE o.conversation_id IS NOT NULL AND o.status != 'cancelado'
       AND o.created_at >= ? AND o.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.conversation_id = o.conversation_id)`,
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
  const conversionPct = convsTotal > 0 ? Math.round((convsConPedido / convsTotal) * 100) : null;
  const costoPorPedido = pedidosBot > 0 ? costoIA / pedidosBot : null;
  const saludAction =
    pedidosBot === 0
      ? "El bot todavía no cerró pedidos. Verificá que el menú esté cargado y el playbook activo."
      : `El bot cerró ${pedidosBot} pedido${pedidosBot === 1 ? "" : "s"} este período, ${pedidosSinHumano} sin que interviniera nadie, y gastó ${money(costoIA)} en IA` +
        `${costoPorPedido !== null ? ` (${money(costoPorPedido)} por pedido)` : ""}. ` +
        `${abandonadas > 0 ? `${abandonadas} conversación${abandonadas === 1 ? "" : "es"} quedó sin cerrar — mirá cuáles en Conversaciones.` : "Ninguna conversación quedó colgada."}`;

  return {
    window: win,
    prevWindow: prev,
    ventas: {
      total: ventasCur,
      prev: ventasPrev,
      deltaPct: ventasDelta,
      byDay,
      pedidos,
      cancelados,
      action: cancelPct >= 15 ? `${ventasAction} Ojo: ${cancelPct}% de los pedidos se cancelaron.` : ventasAction,
    },
    ticket: { avg: tAvg ?? 0, prevAvg: tPrev ?? 0, deltaPct: tDelta, action: ticketAction },
    productos: { top, sinVenta, action: productosAction },
    pico: { cells, topLabel, action: picoAction },
    clientes: {
      nuevos,
      recurrentes,
      top: topClientes,
      dejaron: dejaron.slice(0, 10),
      dejaronMonto,
      action: clientesAction,
    },
    salud: {
      convsConPedido,
      convsTotal,
      conversionPct,
      pedidosSinHumano,
      pedidosBot,
      abandonadas,
      costoIA,
      costoPorPedido,
      action: saludAction,
    },
  };
}

/** CSV plano de los 6 reportes (una sección por reporte). */
export function reportsToCsv(r: RestaurantReports): string {
  const rows: string[][] = [];
  const push = (...cells: (string | number)[]) => rows.push(cells.map((c) => String(c)));
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

  push("REPORTE", "métrica", "valor");
  push("Ventas", "total período", r.ventas.total);
  push("Ventas", "total período anterior", r.ventas.prev);
  push("Ventas", "variación %", r.ventas.deltaPct ?? "");
  push("Ventas", "pedidos", r.ventas.pedidos);
  push("Ventas", "cancelados", r.ventas.cancelados);
  for (const d of r.ventas.byDay) push("Ventas por día", d.day, d.total);
  push("Ticket promedio", "actual", r.ticket.avg);
  push("Ticket promedio", "anterior", r.ticket.prevAvg);
  for (const p of r.productos.top) push("Producto (top)", p.name, `${p.units} u · ${p.revenue}`);
  for (const n of r.productos.sinVenta) push("Producto (sin venta)", n, 0);
  for (const c of r.pico.cells) push("Pico", `${DOW[c.dow]} ${c.hour}h`, c.n);
  push("Clientes", "nuevos", r.clientes.nuevos);
  push("Clientes", "recurrentes", r.clientes.recurrentes);
  for (const c of r.clientes.top) push("Cliente (top)", c.name ?? c.phone, `${c.orders} pedidos · ${c.total}`);
  for (const c of r.clientes.dejaron) push("Cliente (dejó de pedir)", c.name ?? c.phone, c.total);
  push("Salud del bot", "conversaciones con pedido", r.salud.convsConPedido);
  push("Salud del bot", "conversaciones totales", r.salud.convsTotal);
  push("Salud del bot", "pedidos sin intervención humana", r.salud.pedidosSinHumano);
  push("Salud del bot", "conversaciones abandonadas", r.salud.abandonadas);
  push("Salud del bot", "costo IA del período", r.salud.costoIA);

  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
