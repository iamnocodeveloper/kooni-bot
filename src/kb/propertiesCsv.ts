// Importador CSV/TSV de propiedades para el giro inmobiliaria.
//
// Sin dependencias: parser propio que respeta comillas (con comas y saltos de
// línea adentro) y autodetecta el separador — la gente pega desde Excel (tab) o
// desde un CSV (coma/punto y coma). El mapeo es por ENCABEZADOS (es/en); si no
// los reconoce, cae al orden canónico de columnas (el de la plantilla).
import type { EstatusPropiedad, Moneda, Operacion, Propiedad, PropiedadImport } from "./properties";
import { propertyKey } from "./properties";

export interface CsvPropertyError {
  /** Número de línea del CSV (1 = encabezado). */
  line: number;
  motivo: string;
}

export interface CsvImportResult {
  props: PropiedadImport[];
  errors: CsvPropertyError[];
  /** true si el mapeo fue por encabezados; false si fue posicional. */
  byHeader: boolean;
}

/** Orden canónico de columnas (el de la plantilla que se le da al cliente). */
export const PROPIEDAD_CSV_COLUMNS = [
  "titulo",
  "operacion",
  "tipo",
  "zona",
  "precio",
  "moneda",
  "recamaras",
  "banos",
  "estacionamiento",
  "m2",
  "m2terreno",
  "estatus",
  "referencia",
  "link",
  "imagen",
  "extras",
  "requisitos",
] as const;

/** Encabezado listo para pegar/exportar. */
export function csvHeader(): string {
  return PROPIEDAD_CSV_COLUMNS.join(",");
}

/** Cuenta el separador más probable fuera de comillas en la primera línea. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  let best = ",";
  for (const [sep, n] of Object.entries(counts)) {
    if (n > (counts[best] ?? 0)) best = sep;
  }
  return best;
}

/** Parser CSV/TSV con comillas al estilo RFC 4180 (y `""` para una comilla). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  // Descarta filas totalmente vacías (Excel deja líneas sueltas al final).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Número tolerante: `$1,250,000.00`, `1.250.000`, `12,500 MXN`, `3200`. */
export function parseNum(raw: string): number | null {
  const s = raw.replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let norm: string;
  if (dots > 1 && commas === 0) {
    // Formato europeo: los puntos son miles (1.250.000).
    norm = s.replace(/\./g, "");
  } else if (commas > 1 && dots === 0) {
    // 1,250,000
    norm = s.replace(/,/g, "");
  } else if (dots >= 1 && commas >= 1) {
    // Gana el separador que está MÁS A LA DERECHA: ese es el decimal.
    norm =
      s.lastIndexOf(".") > s.lastIndexOf(",")
        ? s.replace(/,/g, "")
        : s.replace(/\./g, "").replace(",", ".");
  } else if (commas === 1) {
    const decimals = s.length - s.lastIndexOf(",") - 1;
    norm = decimals === 1 || decimals === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (dots === 1) {
    const decimals = s.length - s.lastIndexOf(".") - 1;
    norm = decimals === 3 ? s.replace(/\./g, "") : s;
  } else {
    norm = s;
  }
  const n = Number.parseFloat(norm);
  return Number.isFinite(n) ? n : null;
}

/** Primer entero del texto: `3 recámaras` → 3. */
export function parseIntLoose(raw: string): number | null {
  const m = raw.match(/\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

export function normOperacion(raw: string): Operacion | null {
  const s = raw.toLowerCase();
  if (/(rent|alquil|arriend|monthly)/.test(s)) return "renta";
  if (/(vent|compra|sale|for sale)/.test(s)) return "venta";
  return null;
}

export function normMoneda(raw: string): Moneda | null {
  const s = raw.toLowerCase();
  if (/(usd|u\$s|us\$|d[oó]lar|dollar|\bus\b)/.test(s)) return "USD";
  if (/(mxn|peso|mex|\$mx)/.test(s)) return "MXN";
  return null;
}

export function normEstatus(raw: string): EstatusPropiedad | null {
  const s = raw.toLowerCase();
  if (/(apartad|reservad|pending)/.test(s)) return "apartado";
  if (/(vendid|sold|cerrad)/.test(s)) return "vendido";
  if (/(rentad|alquilad|rented|leased)/.test(s)) return "rentado";
  if (/(disponible|available|libre|activo)/.test(s)) return "disponible";
  return null;
}

const TIPOS: { re: RegExp; tipo: string }[] = [
  { re: /(departamento|depto|apartamento|apartment|flat)/, tipo: "departamento" },
  { re: /(casa|house|residencia|villa|chalet)/, tipo: "casa" },
  { re: /(terreno|lote|land|predio)/, tipo: "terreno" },
  { re: /(oficina|office|consultorio)/, tipo: "oficina" },
  { re: /(bodega|nave|almac[eé]n|warehouse)/, tipo: "bodega" },
  { re: /(local|comercial|retail)/, tipo: "local" },
  { re: /(proyecto|preventa|desarrollo|condominio)/, tipo: "proyecto" },
];

export function normTipo(raw: string): string | null {
  const s = raw.toLowerCase();
  if (!s.trim()) return null;
  for (const t of TIPOS) if (t.re.test(s)) return t.tipo;
  return s.trim().slice(0, 40);
}

/** Alias de encabezados aceptados (es/en), normalizados. */

type Col =
  | "titulo"
  | "operacion"
  | "tipo"
  | "zona"
  | "precio"
  | "moneda"
  | "recamaras"
  | "banos"
  | "estacionamiento"
  | "m2"
  | "m2terreno"
  | "estatus"
  | "referencia"
  | "link"
  | "imagen"
  | "extras"
  | "requisitos";

const COLS: Record<string, Col> = {
  titulo: "titulo",
  title: "titulo",
  titulo_propiedad: "titulo",
  operacion: "operacion",
  operation: "operacion",
  tipo: "tipo",
  type: "tipo",
  zona: "zona",
  zone: "zona",
  colonia: "zona",
  ubicacion: "zona",
  location: "zona",
  precio: "precio",
  price: "precio",
  moneda: "moneda",
  currency: "moneda",
  recamaras: "recamaras",
  recamara: "recamaras",
  bedrooms: "recamaras",
  banos: "banos",
  bathrooms: "banos",
  estacionamiento: "estacionamiento",
  parking: "estacionamiento",
  m2: "m2",
  metros: "m2",
  superficie: "m2",
  area: "m2",
  m2terreno: "m2terreno",
  terreno: "m2terreno",
  estatus: "estatus",
  status: "estatus",
  referencia: "referencia",
  codigo: "referencia",
  code: "referencia",
  reference: "referencia",
  link: "link",
  url: "link",
  imagen: "imagen",
  image: "imagen",
  foto: "imagen",
  extras: "extras",
  requisitos: "requisitos",
};

function normHeader(h: string): Col | null {
  const key = h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return COLS[key] ?? null;
}

function toPropiedad(cols: Partial<Record<Col, string>>, line: number, feedUrl: string | null, errors: CsvPropertyError[]): PropiedadImport | null {
  const title = (cols.titulo ?? "").trim();
  if (!title) {
    errors.push({ line, motivo: "sin título (columna titulo/title vacía)" });
    return null;
  }
  const operacion = cols.operacion ? normOperacion(cols.operacion) : null;
  const precio = cols.precio ? parseNum(cols.precio) : null;
  const zona = (cols.zona ?? "").trim() || null;
  const linkRaw = (cols.link ?? "").trim();
  const link = /^https?:\/\//i.test(linkRaw) ? linkRaw : null;
  const imagenRaw = (cols.imagen ?? "").trim();
  const imagen = /^https?:\/\//i.test(imagenRaw) ? imagenRaw : null;
  if (!operacion && precio === null && !zona) {
    errors.push({ line, motivo: `"${title.slice(0, 40)}": sin operación, precio ni zona` });
    return null;
  }
  const codigo = (cols.referencia ?? "").trim() || null;
  const p: PropiedadImport = {
    key: propertyKey(codigo, link ?? `${title}|${zona ?? ""}`),
    codigo,
    title: title.slice(0, 200),
    operacion,
    tipo: cols.tipo ? normTipo(cols.tipo) : null,
    zona: zona ? zona.slice(0, 120) : null,
    precio,
    moneda: (cols.moneda ? normMoneda(cols.moneda) : null) ?? (precio !== null ? "MXN" : null),
    recamaras: cols.recamaras ? parseIntLoose(cols.recamaras) : null,
    banos: cols.banos ? parseIntLoose(cols.banos) : null,
    estacionamiento: cols.estacionamiento ? parseIntLoose(cols.estacionamiento) : null,
    m2: cols.m2 ? parseNum(cols.m2) : null,
    m2Terreno: cols.m2terreno ? parseNum(cols.m2terreno) : null,
    estatus: (cols.estatus ? normEstatus(cols.estatus) : null) ?? "disponible",
    extras: (cols.extras ?? "").trim().slice(0, 1000) || null,
    requisitos: (cols.requisitos ?? "").trim().slice(0, 1000) || null,
    listingUrl: link,
    feedUrl,
    source: "csv",
    imageUrl: imagen,
  };
  return p;
}

/**
 * Convierte el texto pegado (CSV/TSV) en propiedades. Nunca aborta por una fila
 * mala: la reporta en `errors` y sigue con las demás.
 */
export function mapCsvToPropiedades(text: string, feedUrl: string | null = null): CsvImportResult {
  const rows = parseCsv(text);
  const errors: CsvPropertyError[] = [];
  if (rows.length === 0) return { props: [], errors, byHeader: false };

  const header = rows[0] ?? [];
  const mapped = header.map(normHeader);
  const recognized = mapped.filter(Boolean).length;
  const byHeader = recognized >= 3;

  const props: Propiedad[] = [];
  if (byHeader) {
    for (let i = 1; i < rows.length; i++) {
      const raw = rows[i] ?? [];
      const cols: Partial<Record<Col, string>> = {};
      mapped.forEach((col, idx) => {
        if (col) cols[col] = raw[idx] ?? "";
      });
      const p = toPropiedad(cols, i + 1, feedUrl, errors);
      if (p) props.push(p);
    }
    return { props, errors, byHeader };
  }

  // Posicional (sin encabezados): orden canónico de la plantilla.
  const cols = PROPIEDAD_CSV_COLUMNS;
  const start = mapped[0] === "titulo" ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const raw = rows[i] ?? [];
    const obj: Partial<Record<Col, string>> = {};
    cols.forEach((col, idx) => {
      obj[col as Col] = raw[idx] ?? "";
    });
    const p = toPropiedad(obj, i + 1, feedUrl, errors);
    if (p) props.push(p);
  }
  return { props, errors, byHeader: false };
}
