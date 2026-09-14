import { parseZones, type TaxiBase, type TaxiZone } from "../db/taxi";

// Lógica pura del despacho de taxis (sin DB ni red) — fácil de testear.
// Decide qué base atiende una solicitud y cuánto costaría, y clasifica lo que
// escribe un conductor.

export interface Coords {
  lat: number;
  lng: number;
}

export function validCoords(c: Partial<Coords> | null | undefined): c is Coords {
  return !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat as number) <= 90 && Math.abs(c.lng as number) <= 180;
}

/** Distancia en km entre dos coordenadas (Haversine). */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Normaliza texto para comparar zonas (sin acentos, minúsculas, sin signos). */
export function zoneKey(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Palabras genéricas que no distinguen una zona de otra.
const ZONE_STOPWORDS = new Set(["zona", "barrio", "colonia", "sector", "area", "ciudad", "municipio", "de", "del", "la", "el", "los", "las"]);

function zoneTokens(key: string): string[] {
  return key.split(" ").filter((t) => t.length >= 3 && !ZONE_STOPWORDS.has(t));
}

/** ¿La base cubre la zona escrita? Devuelve la zona (con su tarifa) o null. */
export function matchZone(base: Pick<TaxiBase, "zones">, zoneText: string | null | undefined): TaxiZone | null {
  const key = zoneKey(zoneText);
  if (!key) return null;
  const qTokens = zoneTokens(key);
  for (const z of parseZones(base)) {
    const zk = zoneKey(z.name);
    if (!zk) continue;
    if (zk === key || zk.includes(key) || key.includes(zk)) return z;
    // Coincidencia por palabra significativa ("aurora norte" ↔ "zona norte").
    const zTokens = zoneTokens(zk);
    if (qTokens.length && zTokens.length && qTokens.some((t) => zTokens.includes(t))) return z;
  }
  return null;
}

export type BasePickReason = "gps" | "zone" | "default" | "busiest" | "none";

export interface BasePick {
  base: TaxiBase | null;
  zone: TaxiZone | null;
  reason: BasePickReason;
}

export interface PickBaseInput {
  bases: TaxiBase[];
  /** Conductores esperando por base (baseId → cantidad). */
  waitingByBase: Record<string, number>;
  location?: Coords | null;
  zoneText?: string | null;
}

/**
 * Elige la base que atiende la solicitud:
 *  1. Con coordenadas → la base CON conductores más cercana (Haversine).
 *  2. Con zona escrita → la base que cubre esa zona.
 *  3. Si no matchea → la base marcada `is_default` con conductores.
 *  4. Si no hay default → la base con más conductores esperando (best-effort).
 *  5. Si ninguna tiene conductores → null (`none`).
 */
export function pickBase(input: PickBaseInput): BasePick {
  const candidates = input.bases.filter((b) => b.active === 1 && (input.waitingByBase[b.id] ?? 0) > 0);
  if (!candidates.length) return { base: null, zone: null, reason: "none" };

  if (validCoords(input.location)) {
    const loc = input.location;
    let best: { base: TaxiBase; d: number } | null = null;
    for (const b of candidates) {
      if (!validCoords({ lat: b.lat ?? NaN, lng: b.lng ?? NaN })) continue;
      const d = haversineKm(loc, { lat: b.lat as number, lng: b.lng as number });
      if (!best || d < best.d) best = { base: b, d };
    }
    if (best) {
      return { base: best.base, zone: matchZone(best.base, input.zoneText), reason: "gps" };
    }
  }

  if (input.zoneText) {
    for (const b of candidates) {
      const z = matchZone(b, input.zoneText);
      if (z) return { base: b, zone: z, reason: "zone" };
    }
  }

  const def = candidates.find((b) => b.is_default === 1);
  if (def) return { base: def, zone: null, reason: "default" };

  const busiest = [...candidates].sort(
    (a, b) => (input.waitingByBase[b.id] ?? 0) - (input.waitingByBase[a.id] ?? 0),
  )[0];
  return { base: busiest ?? null, zone: null, reason: "busiest" };
}

/** Tarifa estimada: tarifa base de la base + la tarifa de la zona (si hay). */
export function estimateFare(base: Pick<TaxiBase, "base_fare">, zone: TaxiZone | null): number {
  return Math.max(0, (base.base_fare ?? 0) + (zone?.fee ?? 0));
}

// ── Comandos de conductor ─────────────────────────────────────────────────────

export type DriverCommand = "enqueue" | "leave" | "finish" | "status";

/**
 * Clasifica lo que escribe un conductor. Por defecto, cualquier mensaje se toma
 * como "llegué a la base" → entra a la cola. Palabras clave cambian el sentido.
 */
export function parseDriverCommand(text: string | null | undefined): DriverCommand {
  const t = zoneKey(text);
  if (!t) return "enqueue";
  if (/\b(salir|salgo|saliendo|fuera|me voy|retirar|retiro|pausa|descanso|break)\b/.test(t)) return "leave";
  if (/\b(fin|finalizar|finalizo|termine|terminar|listo|completado|acabe|acabo)\b/.test(t)) return "finish";
  if (/\b(estado|posicion|cola|donde|cuantos|numero)\b/.test(t)) return "status";
  return "enqueue";
}
