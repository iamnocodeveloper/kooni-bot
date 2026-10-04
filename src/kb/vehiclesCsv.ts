// Importador CSV/TSV del INVENTARIO de autos (giro concesionario).
//
// Un concesionario sin sitio legible (o sin cuenta de scraping) carga su lote
// pegando un CSV o un Excel desde /admin/scraping/inventario. Reusa el parser
// con comillas de propertiesCsv y guarda en el MISMO store que Web Sync
// (`web_sync_vehicles`), marcando cada auto con `source: "csv"` para que el
// scraping nocturno no lo borre. Así inventarioQuery / fichaAuto funcionan igual
// venga el auto del sitio o del CSV.
//
// Unidades: el inventario completo trabaja en millas y moneda tal cual se
// escribe (el bot repite lo que devuelve la tool). Por eso NO se acepta una
// columna "km" ni se convierte nada: la columna se llama `millas`.
import type { Env } from "../env";
import { Db } from "../db/client";
import { KbDocsRepo, indexDoc } from "./docs";
import {
  listStoredVehicles,
  renderInventorySummary,
  vehicleKey,
  type StoredVehicle,
  type VehicleStore,
} from "./inventory";
import { parseCsv, parseNum } from "./propertiesCsv";

/** `feedUrl` de los autos cargados a mano (no es una URL real; no se scrapea). */
export const CSV_FEED = "csv:manual";
/** Doc de KB con marcas y reglas anti-alucinación del inventario cargado por CSV. */
export const AUTOS_CSV_RESUMEN_ID = "inventario-autos-resumen";

export interface CsvVehicleError {
  /** Número de línea del CSV (1 = encabezado). */
  line: number;
  motivo: string;
}

export interface CsvVehicleResult {
  vehicles: StoredVehicle[];
  errors: CsvVehicleError[];
  /** true si el mapeo fue por encabezados; false si fue posicional. */
  byHeader: boolean;
}

/** Orden canónico de columnas (el de la plantilla que se le da al cliente). */
export const VEHICLE_CSV_COLUMNS = [
  "vin",
  "anio",
  "marca",
  "modelo",
  "version",
  "condicion",
  "precio",
  "millas",
  "link",
  "imagen",
] as const;

type Col = (typeof VEHICLE_CSV_COLUMNS)[number] | "titulo";

/** Encabezado listo para pegar/exportar. */
export function vehicleCsvHeader(): string {
  return VEHICLE_CSV_COLUMNS.join(",");
}

const COLS: Record<string, Col> = {
  vin: "vin",
  niv: "vin",
  titulo: "titulo",
  title: "titulo",
  anio: "anio",
  ano: "anio",
  year: "anio",
  marca: "marca",
  make: "marca",
  brand: "marca",
  modelo: "modelo",
  model: "modelo",
  version: "version",
  trim: "version",
  submodelo: "version",
  condicion: "condicion",
  condition: "condicion",
  estado: "condicion",
  precio: "precio",
  price: "precio",
  millas: "millas",
  miles: "millas",
  mileage: "millas",
  odometro: "millas",
  odometer: "millas",
  link: "link",
  url: "link",
  ficha: "link",
  imagen: "imagen",
  image: "imagen",
  foto: "imagen",
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normHeader(h: string): Col | null {
  const key = stripAccents(h)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return COLS[key] ?? null;
}

/** "nuevo" | "usado" | "seminuevo" | "certified"… → Nuevo | Usado | Certificado. */
export function normCondicion(raw: string): string | null {
  const c = stripAccents(raw).toLowerCase();
  if (/certifi|\bcpo\b/.test(c)) return "Certificado";
  if (/usad|seminuev|pre.?owned|used/.test(c)) return "Usado";
  if (/nuev|\bnew\b/.test(c)) return "Nuevo";
  return null;
}

const VIN_OK = /^[A-HJ-NPR-Z0-9]{11,17}$/;
const YEAR_OK = /^(19|20)\d{2}$/;

function clean(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function toVehicle(
  cols: Partial<Record<Col, string>>,
  line: number,
  errors: CsvVehicleError[],
  now: number,
): StoredVehicle | null {
  const marca = clean(cols.marca ?? "") || null;
  const modelo = clean(cols.modelo ?? "") || null;
  const version = clean(cols.version ?? "");
  const yearRaw = (cols.anio ?? "").trim().match(/(19|20)\d{2}/)?.[0] ?? "";
  const year = YEAR_OK.test(yearRaw) ? Number.parseInt(yearRaw, 10) : null;

  const explicit = clean(cols.titulo ?? "");
  const title = (explicit || [year, marca, modelo, version].filter(Boolean).join(" ")).slice(0, 200);
  if (title.length < 3) {
    errors.push({ line, motivo: "sin título: falta marca y modelo (columnas marca/modelo o titulo)" });
    return null;
  }

  const vinRaw = (cols.vin ?? "").replace(/\s+/g, "").toUpperCase();
  let vin: string | null = null;
  if (vinRaw) {
    if (VIN_OK.test(vinRaw)) vin = vinRaw;
    else errors.push({ line, motivo: `"${title.slice(0, 40)}": VIN inválido (${vinRaw.slice(0, 20)}); se importó sin VIN` });
  }

  const precio = cols.precio ? parseNum(cols.precio) : null;
  const millasN = cols.millas ? parseNum(cols.millas) : null;
  const linkRaw = (cols.link ?? "").trim();
  const link = /^https?:\/\//i.test(linkRaw) ? linkRaw : null;
  const imgRaw = (cols.imagen ?? "").trim();
  const imageUrl = /^https?:\/\//i.test(imgRaw) ? imgRaw : null;

  return {
    // Sin VIN ni link la llave sale del título: reimportar el mismo auto lo actualiza.
    key: vehicleKey(vin, link ?? `csv|${stripAccents(title).toLowerCase()}`),
    vin,
    title,
    year,
    make: marca,
    model: modelo,
    condition: cols.condicion ? normCondicion(cols.condicion) : null,
    price: precio !== null && precio > 0 ? Math.round(precio) : null,
    miles: millasN !== null && millasN >= 0 ? Math.round(millasN) : null,
    listingUrl: link,
    feedUrl: CSV_FEED,
    imageUrl,
    imgStatus: imageUrl ? "ok" : "pendiente",
    imgAt: imageUrl ? now : null,
    pricing: null,
    changedAt: now,
    source: "csv",
  };
}

/**
 * Convierte el texto pegado (CSV/TSV) en autos. Nunca aborta por una fila mala:
 * la reporta en `errors` y sigue con las demás.
 */
export function mapCsvToVehicles(text: string, now = Date.now()): CsvVehicleResult {
  const rows = parseCsv(text);
  const errors: CsvVehicleError[] = [];
  if (rows.length === 0) return { vehicles: [], errors, byHeader: false };

  const mapped = (rows[0] ?? []).map(normHeader);
  const byHeader = mapped.filter(Boolean).length >= 3;
  const vehicles: StoredVehicle[] = [];

  const colsFor = (raw: string[]): Partial<Record<Col, string>> => {
    const cols: Partial<Record<Col, string>> = {};
    if (byHeader) {
      mapped.forEach((col, idx) => {
        if (col) cols[col] = raw[idx] ?? "";
      });
    } else {
      VEHICLE_CSV_COLUMNS.forEach((col, idx) => {
        cols[col] = raw[idx] ?? "";
      });
    }
    return cols;
  };

  // Posicional sin encabezado: si la 1ª fila parece encabezado (dice "vin"), se salta.
  const start = byHeader || mapped[0] === "vin" ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const raw = rows[i] ?? [];
    if (raw.every((c) => !c.trim())) continue;
    const v = toVehicle(colsFor(raw), i + 1, errors, now);
    if (v) vehicles.push(v);
  }
  return { vehicles, errors, byHeader };
}

export interface MergeCsvResult {
  store: VehicleStore;
  added: number;
  updated: number;
}

/**
 * Mezcla los autos del CSV con el store. Reimportar actualiza por llave (VIN o
 * título) conservando la foto ya guardada si el CSV no trae una nueva. No toca
 * los autos que vienen del scraping. El CSV es una CARGA, no una lista completa:
 * un auto que ya no aparece en el CSV se queda (para quitarlo, reimporta con la
 * opción de reemplazar).
 */
export function mergeCsvVehicles(
  prev: VehicleStore,
  incoming: StoredVehicle[],
  opts: { replace?: boolean } = {},
): MergeCsvResult {
  const vehicles: Record<string, StoredVehicle> = { ...prev.vehicles };
  if (opts.replace) {
    for (const [k, v] of Object.entries(vehicles)) if (v.source === "csv") delete vehicles[k];
  }
  let added = 0;
  let updated = 0;
  for (const v of incoming) {
    const old = prev.vehicles[v.key];
    if (old && old.source !== "csv") {
      // Mismo auto que ya trae el scraping: el CSV completa precio/millas/condición
      // que falten, pero no cambia su origen ni su ficha.
      vehicles[v.key] = {
        ...old,
        price: old.price ?? v.price,
        miles: old.miles ?? v.miles,
        condition: old.condition ?? v.condition,
      };
      continue;
    }
    if (!old) added++;
    else if (old.price !== v.price || old.miles !== v.miles || old.title !== v.title || old.condition !== v.condition) updated++;
    vehicles[v.key] = {
      ...v,
      imageUrl: v.imageUrl ?? old?.imageUrl ?? null,
      imgStatus: v.imageUrl ? "ok" : old?.imageUrl ? old.imgStatus : v.imgStatus,
      imgAt: v.imageUrl ? v.imgAt : (old?.imgAt ?? v.imgAt),
      changedAt: old && old.title === v.title && old.price === v.price && old.miles === v.miles ? old.changedAt : v.changedAt,
    };
  }
  return { store: { updatedAt: prev.updatedAt, vehicles }, added, updated };
}

/** Escribe/actualiza el doc de resumen en la KB (marcas reales + reglas). */
export async function buildAndIndexAutosResumen(env: Env, db: Db, store: VehicleStore): Promise<boolean> {
  const csv = listStoredVehicles(store).filter((v) => v.source === "csv");
  const repo = new KbDocsRepo(db);
  if (csv.length === 0) {
    await repo.delete(AUTOS_CSV_RESUMEN_ID).catch(() => undefined);
    return false;
  }
  await repo.upsert({
    id: AUTOS_CSV_RESUMEN_ID,
    title: "Inventario de autos (carga manual)",
    content: renderInventorySummary(csv, "inventario cargado por el dueño", "carga manual (CSV)"),
  });
  await indexDoc(env, (await repo.getById(AUTOS_CSV_RESUMEN_ID))!);
  return true;
}
