/**
 * Análisis IA del inventario scrapeado (OPCIONAL: apagado por defecto).
 *
 * El parseo de Decodo es 100% determinista (regex + JSON-LD). Cuando el sitio
 * cambia de maquetación entran autos con el título cortado, el precio en el
 * campo equivocado o millas basura — y el bot repite eso al cliente. Acá un
 * modelo (típicamente uno bueno y caro; ver `analysis_llm_*`) revisa los autos
 * YA parseados y devuelve CORRECCIONES.
 *
 * Garantías de seguridad (es lo que lo hace seguro de encender):
 * - El modelo solo puede tocar autos que ya existen, identificados por `key`.
 *   NO agrega ni borra: el store sigue mandando por el parser determinista.
 * - Toda corrección se valida antes de aplicarse (año, precio, millas, largos).
 * - Si no hay API key, el modelo falla o devuelve basura, el pipeline sigue con
 *   los datos deterministas. El análisis NUNCA es la ruta crítica.
 */
import { generateText } from "ai";
import type { Env } from "../env";
import { Db } from "../db/client";
import { SettingsRepo, SETTING_KEYS } from "../db/settings";
import { loadAnalysisLlmOverrides } from "../settings-loader";
import { createAnalysisModel } from "../llm/provider";
import {
  loadVehicleStore,
  saveVehicleStore,
  listStoredVehicles,
  type StoredVehicle,
  type VehicleStore,
} from "./inventory";

/** Campos que el modelo puede corregir, más el motivo (queda en el log). */
export interface VehicleCorrection {
  key: string;
  title?: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  price?: number | null;
  miles?: number | null;
  condition?: string | null;
  motivo?: string;
}

/** Cuántos autos se mandan al modelo por corrida (cota de costo). */
const MAX_BATCH = 40;
const MIN_YEAR = 1980;
const MAX_PRICE = 1_000_000;
const MAX_MILES = 1_000_000;
const MAX_TITLE = 120;
const MAX_SHORT = 60;
const MAX_MOTIVO = 200;

function maxYear(): number {
  return new Date().getUTCFullYear() + 2;
}

function cleanStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s+/g, " ");
  if (!s || s.length > max) return undefined;
  return s;
}

function cleanNum(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : NaN;
  if (!Number.isFinite(n)) return undefined;
  const i = Math.round(n);
  if (i < min || i > max) return undefined;
  return i;
}

/**
 * Heurística barata (sin IA) de autos que conviene revisar sí o sí: sin VIN, sin
 * precio, sin año, título sospechosamente corto o con basura de plantilla.
 */
export function findSuspiciousVehicles(vehicles: StoredVehicle[]): StoredVehicle[] {
  return vehicles.filter(
    (v) =>
      !v.vin ||
      v.price === null ||
      v.year === null ||
      v.title.trim().length < 6 ||
      /undefined|null|n\/a|ver m[aá]s|loading/i.test(v.title),
  );
}

/**
 * Selecciona hasta `MAX_BATCH` autos dando prioridad a los sospechosos, para
 * gastar los tokens del modelo donde aportan.
 */
export function selectBatch(vehicles: StoredVehicle[], limit = MAX_BATCH): StoredVehicle[] {
  if (vehicles.length <= limit) return vehicles;
  const picked: StoredVehicle[] = [];
  const taken = new Set<string>();
  for (const v of findSuspiciousVehicles(vehicles)) {
    if (picked.length >= limit) break;
    picked.push(v);
    taken.add(v.key);
  }
  for (const v of vehicles) {
    if (picked.length >= limit) break;
    if (!taken.has(v.key)) picked.push(v);
  }
  return picked;
}

/** Extrae el JSON de la respuesta del modelo (tolera ```json … ``` y prosa). */
export function extractJson(raw: string): unknown {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const opener = body[start];
  const closer = opener === "[" ? "]" : "}";
  const end = body.lastIndexOf(closer);
  if (end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Convierte la respuesta cruda del modelo en correcciones VÁLIDAS.
 * Pura y testeable: no toca red ni base de datos.
 *
 * Se descarta cualquier corrección que: apunte a un auto inexistente, proponga
 * valores fuera de rango o no aporte ningún cambio real.
 */
export function parseCorrections(raw: unknown, vehicles: StoredVehicle[]): VehicleCorrection[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { correcciones?: unknown[] }).correcciones)
      ? (raw as { correcciones: unknown[] }).correcciones
      : [];
  const byKey = new Map(vehicles.map((v) => [v.key, v]));

  const out: VehicleCorrection[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key : typeof rec.clave === "string" ? rec.clave : "";
    const current = byKey.get(key);
    if (!current) continue; // auto inexistente → se ignora (no inventa)

    const corr: VehicleCorrection = { key };
    const title = cleanStr(rec.title ?? rec.titulo, MAX_TITLE);
    if (title && title !== current.title) corr.title = title;

    const make = cleanStr(rec.make ?? rec.marca, MAX_SHORT);
    if (make && make !== (current.make ?? "")) corr.make = make;

    const model = cleanStr(rec.model ?? rec.modelo, MAX_SHORT);
    if (model && model !== (current.model ?? "")) corr.model = model;

    const year = cleanNum(rec.year ?? rec.año ?? rec.anio, MIN_YEAR, maxYear());
    if (year !== undefined && year !== current.year) corr.year = year;

    const price = cleanNum(rec.price ?? rec.precio, 1, MAX_PRICE);
    if (price !== undefined && price !== current.price) corr.price = price;

    const miles = cleanNum(rec.miles ?? rec.millas, 0, MAX_MILES);
    if (miles !== undefined && miles !== current.miles) corr.miles = miles;

    const condition = cleanStr(rec.condition ?? rec.condicion, MAX_SHORT);
    if (condition && condition !== (current.condition ?? "")) corr.condition = condition;

    const motivo = cleanStr(rec.motivo ?? rec.reason, MAX_MOTIVO);
    if (motivo) corr.motivo = motivo;

    const changed = Object.keys(corr).some((k) => k !== "key" && k !== "motivo");
    if (changed) out.push(corr);
  }
  return out;
}

export interface ApplyResult {
  applied: number;
  fields: number;
}

/**
 * Aplica correcciones a una COPIA del store. Nunca agrega ni elimina autos y
 * marca `changedAt` solo en los autos efectivamente tocados.
 */
export function applyCorrections(store: VehicleStore, corrections: VehicleCorrection[]): ApplyResult {
  let applied = 0;
  let fields = 0;
  for (const corr of corrections) {
    const target = store.vehicles[corr.key];
    if (!target) continue;
    let touched = 0;
    if (corr.title !== undefined && corr.title !== target.title) { target.title = corr.title; touched++; }
    if (corr.make !== undefined && corr.make !== target.make) { target.make = corr.make; touched++; }
    if (corr.model !== undefined && corr.model !== target.model) { target.model = corr.model; touched++; }
    if (corr.year !== undefined && corr.year !== target.year) { target.year = corr.year; touched++; }
    if (corr.price !== undefined && corr.price !== target.price) { target.price = corr.price; touched++; }
    if (corr.miles !== undefined && corr.miles !== target.miles) { target.miles = corr.miles; touched++; }
    if (corr.condition !== undefined && corr.condition !== target.condition) { target.condition = corr.condition; touched++; }
    if (touched > 0) {
      target.changedAt = Date.now();
      applied++;
      fields += touched;
    }
  }
  return { applied, fields };
}

export interface AnalysisOutcome {
  skipped?: string;
  analyzed: number;
  corrections: number;
  applied: number;
  provider?: string;
  modelId?: string;
  error?: string;
}

/** Construye el prompt con los autos a revisar (JSON compacto y acotado). */
function buildPrompt(vehicles: StoredVehicle[]): string {
  const payload = vehicles.map((v) => ({
    key: v.key,
    title: v.title,
    make: v.make,
    model: v.model,
    year: v.year,
    price: v.price,
    miles: v.miles,
    condition: v.condition,
    vin: v.vin,
  }));
  return (
    "Recibís autos ya extraídos del sitio del concesionario. Algunos campos vienen mal parseados.\n" +
    "Devolvé SOLO un JSON array con las correcciones necesarias; si un auto está bien, NO lo incluyas.\n" +
    "Formato de cada corrección: {\"key\":\"<el mismo key>\",\"title\"?,\"make\"?,\"model\"?,\"year\"?,\"price\"?,\"miles\"?,\"condition\"?,\"motivo\":\"por qué\"}\n" +
    "Reglas ESTRICTAS:\n" +
    "- NUNCA inventes autos nuevos ni cambies el `key`. Solo corregí los que ya están.\n" +
    "- `price` y `miles`: números enteros SIN símbolos ni comas. Si no hay dato, omití el campo (NO pongas null).\n" +
    "- `condition` en español: \"Nuevo\" | \"Usado\" | \"Certificado\".\n" +
    "- No cambies un dato que ya es correcto. Ante la duda, omitilo.\n" +
    "- Respondé únicamente con el JSON array (sin explicaciones).\n\n" +
    "Autos:\n" +
    JSON.stringify(payload)
  );
}

/**
 * Corre el análisis IA sobre el store del inventario y persiste las correcciones
 * válidas. Devuelve un resumen para el registro de scraping.
 *
 * No hace nada (y devuelve `skipped`) si el toggle está apagado, si no hay autos
 * o si el modelo no está disponible.
 */
export async function analyzeInventory(env: Env): Promise<AnalysisOutcome> {
  const db = new Db(env.DB);
  const settings = await new SettingsRepo(db).all();

  if (settings[SETTING_KEYS.webSyncAnalysisEnabled] !== "1") {
    return { skipped: "análisis IA apagado", analyzed: 0, corrections: 0, applied: 0 };
  }

  let store: VehicleStore;
  try {
    store = await loadVehicleStore(db);
  } catch (e) {
    return { skipped: "sin store de inventario", analyzed: 0, corrections: 0, applied: 0, error: String((e as Error)?.message ?? e) };
  }
  const all = listStoredVehicles(store);
  if (all.length === 0) {
    return { skipped: "inventario vacío", analyzed: 0, corrections: 0, applied: 0 };
  }

  const batch = selectBatch(all);
  try {
    const ov = await loadAnalysisLlmOverrides(env);
    const { model, modelId, provider } = createAnalysisModel(env, ov);
    const { text } = await generateText({
      model: model.model,
      prompt: buildPrompt(batch),
      maxOutputTokens: 4000,
    });
    const corrections = parseCorrections(extractJson(text ?? ""), batch);
    const { applied } = applyCorrections(store, corrections);
    if (applied > 0) await saveVehicleStore(db, store);
    return {
      analyzed: batch.length,
      corrections: corrections.length,
      applied,
      provider,
      modelId,
    };
  } catch (e) {
    // El análisis es un extra: un fallo jamás debe romper el sync.
    const msg = String((e as Error)?.message ?? e);
    console.warn("[analysis] el análisis del inventario falló:", msg);
    return { analyzed: batch.length, corrections: 0, applied: 0, error: msg };
  }
}
