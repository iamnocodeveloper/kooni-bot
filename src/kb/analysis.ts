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
  MAX_DESCRIPTION,
  type StoredVehicle,
  type VehicleStore,
} from "./inventory";

/** Campos que el modelo puede corregir, más el motivo (queda en el log). */
export interface VehicleCorrection {
  key: string;
  title?: string;
  make?: string | null;
  model?: string | null;
  /** Versión/trim que distingue dos autos con el mismo título. */
  trim?: string;
  /** Descripción breve con la diferencia real entre versiones. */
  description?: string;
  year?: number | null;
  price?: number | null;
  miles?: number | null;
  condition?: string | null;
  /** Misma unidad que otro `key` (se marca, no se borra). */
  duplicadoDe?: string;
  motivo?: string;
}

/** Cuántos autos se mueven al modelo por corrida (cota de costo). */
const MAX_BATCH = 40;
const MIN_YEAR = 1980;
const MAX_PRICE = 1_000_000;
const MAX_MILES = 1_000_000;
const MAX_TITLE = 120;
const MAX_SHORT = 60;
const MAX_MOTIVO = 200;
const MAX_DESC_PROMPT = 280;

function maxYear(): number {
  return new Date().getUTCFullYear() + 2;
}

function cleanStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s+/g, " ");
  if (!s || s.length > max) return undefined;
  return s;
}

/** Descripción: se recorta en vez de rechazar (el modelo suele extenderse). */
function cleanDesc(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s+/g, " ");
  return s ? s.slice(0, MAX_DESCRIPTION) : undefined;
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

    const trim = cleanStr(rec.trim ?? rec.version ?? rec.versión, MAX_SHORT);
    if (trim && trim !== (current.trim ?? "")) corr.trim = trim;

    const description = cleanDesc(rec.description ?? rec.descripcion ?? rec.descripción);
    if (description && description !== (current.description ?? "")) corr.description = description;

    const dupOf =
      typeof rec.duplicadoDe === "string"
        ? rec.duplicadoDe
        : typeof rec.duplicateOf === "string"
          ? rec.duplicateOf
          : "";
    if (dupOf && dupOf !== key && byKey.has(dupOf)) corr.duplicadoDe = dupOf;

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
    if (corr.trim !== undefined && corr.trim !== target.trim) { target.trim = corr.trim; touched++; }
    if (corr.description !== undefined && corr.description !== target.description) {
      target.description = corr.description;
      touched++;
    }
    if (corr.duplicadoDe && !target.duplicateOf) {
      // Seguridad: solo se marca duplicado si NINGUNO de los dos tiene VIN.
      // Un VIN distinto identifica unidades distintas, sin excepción.
      const other = store.vehicles[corr.duplicadoDe];
      if (other && !target.vin && !other.vin) {
        target.duplicateOf = corr.duplicadoDe;
        touched++;
      }
    }
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
  /** Cuántos autos se marcaron como duplicados de otra unidad. */
  duplicates: number;
  provider?: string;
  modelId?: string;
  error?: string;
}

function normGroup(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Grupos de autos que PODRÍAN ser el mismo (o dos versiones del mismo modelo):
 * año + marca + primera palabra del modelo. Es un pre-paso determinista: el
 * modelo decide después, con URL y descripción, si son la misma unidad o
 * versiones distintas.
 */
export function findNearDuplicates(
  vehicles: StoredVehicle[],
  maxGroups = 8,
  maxItems = 6,
): StoredVehicle[][] {
  const groups = new Map<string, StoredVehicle[]>();
  for (const v of vehicles) {
    const baseModel = (v.model ?? v.title).split(/\s+/)[0] ?? "";
    const key = normGroup(`${v.year ?? ""} ${v.make ?? ""} ${baseModel}`);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(v);
    groups.set(key, arr);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1 && new Set(g.map((v) => v.key)).size > 1)
    .sort((a, b) => b.length - a.length)
    .slice(0, maxGroups)
    .map((g) => g.slice(0, maxItems));
}

/** Construye el prompt con los autos a revisar (JSON compacto y acotado). */
function buildPrompt(vehicles: StoredVehicle[]): string {
  const payload = vehicles.map((v) => ({
    key: v.key,
    title: v.title,
    make: v.make,
    model: v.model,
    trim: v.trim,
    year: v.year,
    price: v.price,
    miles: v.miles,
    condition: v.condition,
    vin: v.vin,
    url: v.listingUrl,
    description: v.description ? v.description.slice(0, MAX_DESC_PROMPT) : null,
  }));
  const groups = findNearDuplicates(vehicles).map((g) =>
    g.map((v) => ({
      key: v.key,
      title: v.title,
      trim: v.trim,
      url: v.listingUrl,
      description: v.description ? v.description.slice(0, MAX_DESC_PROMPT) : null,
      vin: v.vin,
    })),
  );
  return (
    "Recibís autos ya extraídos del sitio del concesionario. Algunos campos vienen mal parseados.\n" +
    "Devolvé SOLO un JSON array con las correcciones necesarias; si un auto está bien, NO lo incluyas.\n" +
    "Formato de cada corrección: {\"key\":\"<el mismo key>\",\"title\"?,\"make\"?,\"model\"?,\"trim\"?,\"description\"?,\"year\"?,\"price\"?,\"miles\"?,\"condition\"?,\"duplicadoDe\"?,\"motivo\":\"por qué\"}\n" +
    "Reglas ESTRICTAS:\n" +
    "- NUNCA inventes autos nuevos ni cambies el `key`. Solo corregí los que ya están.\n" +
    "- `price` y `miles`: números enteros SIN símbolos ni comas. Si no hay dato, omití el campo (NO pongas null).\n" +
    "- `condition` en español: \"Nuevo\" | \"Usado\" | \"Certificado\".\n" +
    "- No cambies un dato que ya es correcto. Ante la duda, omitilo.\n" +
    "- DOS AUTOS PUEDEN COMPARTIR TÍTULO Y SER VERSIONES DISTINTAS. Usá la URL/slug y la descripción para diferenciarlos (ej. \"SX\" vs \"SX Prestige\").\n" +
    "  Si son versiones distintas, proponé `trim` y/o `description` que dejen clara la diferencia. NO los marques como duplicados.\n" +
    "- Solo marcá `\"duplicadoDe\":\"<key>\"` cuando estés seguro de que es LA MISMA unidad publicada dos veces.\n" +
    "  Si alguno de los dos tiene VIN, NUNCA los marques como duplicados (VIN distinto = autos distintos).\n" +
    "- En `posiblesDuplicados` están los grupos que hay que revisar con más cuidado.\n" +
    "- Respondé únicamente con el JSON array (sin explicaciones).\n\n" +
    "Autos:\n" +
    JSON.stringify(payload) +
    "\n\nposiblesDuplicados:\n" +
    JSON.stringify(groups)
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
    return { skipped: "análisis IA apagado", analyzed: 0, corrections: 0, applied: 0, duplicates: 0 };
  }

  let store: VehicleStore;
  try {
    store = await loadVehicleStore(db);
  } catch (e) {
    return {
      skipped: "sin store de inventario",
      analyzed: 0,
      corrections: 0,
      applied: 0,
      duplicates: 0,
      error: String((e as Error)?.message ?? e),
    };
  }
  const all = listStoredVehicles(store, { includeDuplicates: true });
  if (all.length === 0) {
    return { skipped: "inventario vacío", analyzed: 0, corrections: 0, applied: 0, duplicates: 0 };
  }

  // Prioridad: los grupos con posible duplicado / dos versiones del mismo auto.
  const duplicateKeys = new Set(findNearDuplicates(all).flat().map((v) => v.key));
  const prioritized = [...all.filter((v) => duplicateKeys.has(v.key)), ...selectBatch(all)];
  const batch = [...new Map(prioritized.map((v) => [v.key, v])).values()].slice(0, MAX_BATCH);
  try {
    const ov = await loadAnalysisLlmOverrides(env);
    // `createAnalysisModel` ya devuelve el modelo del AI SDK en `.model`:
    // pasarlo como `resolved.model` (no `resolved.model.model`, que es undefined
    // y rompía generateText con "reading 'specificationVersion'").
    const resolved = createAnalysisModel(env, ov);
    const { text } = await generateText({
      model: resolved.model,
      prompt: buildPrompt(batch),
      maxOutputTokens: 4000,
    });
    const corrections = parseCorrections(extractJson(text ?? ""), batch);
    const { applied } = applyCorrections(store, corrections);
    const duplicates = corrections.filter((c) => c.duplicadoDe).length;
    if (applied > 0) await saveVehicleStore(db, store);
    return {
      analyzed: batch.length,
      corrections: corrections.length,
      applied,
      duplicates,
      provider: resolved.provider,
      modelId: resolved.modelId,
    };
  } catch (e) {
    // El análisis es un extra: un fallo jamás debe romper el sync.
    const msg = String((e as Error)?.message ?? e);
    console.warn("[analysis] el análisis del inventario falló:", msg);
    return { analyzed: batch.length, corrections: 0, applied: 0, duplicates: 0, error: msg };
  }
}
