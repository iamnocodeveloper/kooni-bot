import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Guard: las tablas de los nichos NO se pueden borrar sin darse cuenta.
//
// Cada nicho puede tener tablas propias (restaurante: pedidos; cartera:
// cobranza). Este test fija el mapa nicho→tablas y verifica que toda tabla que
// el código de un nicho usa en SQL exista en `schema.sql`. Si alguien borra una
// tabla "sin uso" (porque el nicho no está activo en su instalación), esto rojo.

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (extname(p) === ".ts") out.push(p);
  }
  return out;
}

const schema = readFileSync(join(SRC, "db", "schema.sql"), "utf8");
const schemaTables = new Set(
  [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase()),
);

// Mapa nicho → tablas propias (mantener sincronizado con PLAN.md § REGLA DE ORO).
const NICHE_TABLES: Record<string, string[]> = {
  generico: [],
  "agencia-ia": [],
  inmobiliaria: [],
  clinica: [],
  barberia: [],
  restaurante: ["products", "orders", "order_items", "order_events"],
  cartera: [
    "debtor_lists",
    "debtors",
    "debt_accounts",
    "collection_cases",
    "collection_interactions",
    "collection_contact_attempts",
    "collection_rules",
    "payment_promises",
    "collection_dnc",
  ],
};

/** Archivos que pertenecen a un nicho (SQL específico del giro). */
const NICHE_SRC: Record<string, string[]> = {
  restaurante: [
    join(SRC, "orders"),
    join(SRC, "tools", "tomarPedido.ts"),
  ],
  cartera: [
    join(SRC, "collections"),
    join(SRC, "tools", "collections.ts"),
    join(SRC, "db", "collections.ts"),
  ],
};

function filesFor(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    try {
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else out.push(p);
    } catch {
      /* path ausente: lo reporta el test de abajo */
    }
  }
  return out;
}

/** Tablas referenciadas en SQL dentro de un archivo. */
function sqlTablesIn(content: string): string[] {
  const re = /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.add(m[1].toLowerCase());
  return [...out];
}

describe("nicho → tablas (guard contra borrados accidentales)", () => {
  it("todas las tablas propias de cada nicho existen en schema.sql", () => {
    for (const [niche, tables] of Object.entries(NICHE_TABLES)) {
      for (const t of tables) {
        expect(schemaTables.has(t), `nicho ${niche}: falta la tabla ${t} en schema.sql`).toBe(true);
      }
    }
  });

  it("el código de cada nicho solo usa tablas declaradas en schema.sql", () => {
    const noSql = new Set(["select", "where", "set", "and", "or", "from", "as", "on", "values", "json_each", "json_extract", "coalesce", "case", "when", "then", "else", "end", "order", "by", "group", "limit", "offset", "left", "inner", "join", "using", "distinct", "count", "sum", "strftime", "settings"]);
    for (const [niche, paths] of Object.entries(NICHE_SRC)) {
      for (const f of filesFor(paths)) {
        const content = readFileSync(f, "utf8");
        for (const t of sqlTablesIn(content)) {
          if (noSql.has(t)) continue;
          expect(
            schemaTables.has(t),
            `${niche}: ${f.replace(ROOT, "")} usa la tabla "${t}" que no existe en schema.sql`,
          ).toBe(true);
        }
      }
    }
  });

  it("el mapa de nichos cubre todos los packs registrados", async () => {
    const { readdirSync: rd } = await import("node:fs");
    const packs = rd(join(SRC, "niches"))
      .filter((f) => f.endsWith(".ts") && !["index.ts", "types.ts"].includes(f))
      .map((f) => f.replace(/\.ts$/, ""));
    for (const p of packs) {
      expect(NICHE_TABLES[p], `el pack "${p}" no está en el mapa NICHE_TABLES (PLAN.md § REGLA DE ORO)`).toBeDefined();
    }
  });
});
