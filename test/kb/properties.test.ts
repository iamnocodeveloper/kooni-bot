import { describe, it, expect } from "vitest";
import {
  buildPropiedadesResumen,
  filterStoredPropiedades,
  findPropiedadByCodigo,
  findPropiedadByTitle,
  mergePropiedades,
  propertyKey,
  queryPropiedades,
  type PropiedadImport,
  type PropiedadStore,
  type StoredPropiedad,
} from "../../src/kb/properties";
import { csvHeader, mapCsvToPropiedades, parseCsv, parseNum } from "../../src/kb/propertiesCsv";

function mk(o: Partial<StoredPropiedad> & { title: string }): StoredPropiedad {
  return {
    key: o.key ?? propertyKey(o.codigo ?? null, o.listingUrl ?? null),
    codigo: null,
    operacion: "venta",
    tipo: "casa",
    zona: "Las Lomas",
    precio: 3_000_000,
    moneda: "MXN",
    recamaras: 3,
    banos: 2,
    estacionamiento: 2,
    m2: 180,
    m2Terreno: 240,
    estatus: "disponible",
    extras: null,
    requisitos: null,
    listingUrl: null,
    feedUrl: null,
    source: "csv",
    imageUrl: null,
    imgStatus: "pendiente",
    imgAt: null,
    updatedAt: 0,
    ...o,
  } as StoredPropiedad;
}

function store(props: StoredPropiedad[]): PropiedadStore {
  const s: PropiedadStore = { updatedAt: 0, props: {} };
  for (const p of props) s.props[p.key] = p;
  return s;
}

describe("queryPropiedades", () => {
  const s = store([
    mk({ title: "Casa Las Lomas", key: "a", operacion: "venta", zona: "Las Lomas", precio: 3_000_000, recamaras: 3 }),
    mk({ title: "Casa Las Lomas Premium", key: "b", operacion: "venta", zona: "Las Lomas", precio: 5_200_000, recamaras: 4 }),
    mk({ title: "Depto Centro", key: "c", operacion: "renta", zona: "Centro", precio: 12_500, recamaras: 2, tipo: "departamento" }),
    mk({ title: "Terreno Sur", key: "d", operacion: "venta", zona: "Sur", precio: null, recamaras: null, tipo: "terreno" }),
  ]);

  it("filtra por operación", () => {
    expect(queryPropiedades(s, { operacion: "renta" }).total).toBe(1);
    expect(queryPropiedades(s, { operacion: "venta" }).total).toBe(3);
  });

  it("una propiedad SIN precio no cumple ninguna cota (anti-invento)", () => {
    const r = queryPropiedades(s, { precioMax: 9_000_000 });
    expect(r.matches.some((m) => m.titulo === "Terreno Sur")).toBe(false);
    // El resumen cuenta sobre lo ya filtrado; sin filtro se ve la que no tiene precio.
    expect(r.resumen.sinPrecio).toBe(0);
    expect(queryPropiedades(s, {}).resumen.sinPrecio).toBe(1);
  });

  it("filtra por zona y recámaras mínimas", () => {
    expect(queryPropiedades(s, { zona: "lomas" }).total).toBe(2);
    expect(queryPropiedades(s, { recamarasMin: 4 }).total).toBe(1);
  });

  it("pagina y avisa si hay más", () => {
    const p1 = queryPropiedades(s, {}, 2, 0);
    expect(p1.matches).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    const p2 = queryPropiedades(s, {}, 2, 2);
    expect(p2.hasMore).toBe(false);
  });

  it("resume por operación, zona y precio", () => {
    const r = queryPropiedades(s, {});
    expect(r.resumen.venta).toBe(3);
    expect(r.resumen.renta).toBe(1);
    expect(r.zonas[0]?.zona).toBe("Las Lomas");
  });
});

describe("filterStoredPropiedades (panel)", () => {
  const props = [mk({ title: "A", key: "a", precio: null }), mk({ title: "B", key: "b", operacion: "renta" })];
  it("filtro sin precio / renta / búsqueda", () => {
    expect(filterStoredPropiedades(props, { f: "sinprecio" }).map((p) => p.title)).toEqual(["A"]);
    expect(filterStoredPropiedades(props, { f: "renta" }).map((p) => p.title)).toEqual(["B"]);
    expect(filterStoredPropiedades(props, { q: "b" }).map((p) => p.title)).toEqual(["B"]);
  });
});

describe("mergePropiedades", () => {
  it("agrega nuevas y conserva la foto ya resuelta al re-importar", () => {
    let s: PropiedadStore = { updatedAt: 0, props: {} };
    const first: PropiedadImport[] = [
      { ...mk({ title: "Casa 1", key: "k1", codigo: "LN-1" }), source: "csv" } as PropiedadImport,
    ];
    expect(mergePropiedades(s, first).added).toBe(1);
    s.props["k1"]!.imageUrl = "https://x/foto.jpg";
    s.props["k1"]!.imgStatus = "ok";

    const again: PropiedadImport[] = [
      { ...mk({ title: "Casa 1 actualizada", key: "k1", codigo: "LN-1", precio: null }), source: "csv" } as PropiedadImport,
    ];
    const r = mergePropiedades(s, again);
    expect(r.added).toBe(0);
    expect(s.props["k1"]!.imageUrl).toBe("https://x/foto.jpg");
    expect(s.props["k1"]!.precio).toBe(3_000_000); // no lo pisó un null
    expect(s.props["k1"]!.title).toBe("Casa 1 actualizada");
  });

  it("toma la foto del CSV (columna imagen)", () => {
    const s: PropiedadStore = { updatedAt: 0, props: {} };
    const p = { ...mk({ title: "Con foto", key: "k9" }), imageUrl: "https://x/f.jpg" } as PropiedadImport;
    mergePropiedades(s, [p]);
    expect(s.props["k9"]!.imgStatus).toBe("ok");
  });
});

describe("búsqueda de una propiedad", () => {
  const s = store([mk({ title: "Casa Las Lomas", key: "a", codigo: "LN-1024" })]);
  const titleOf = (r: ReturnType<typeof findPropiedadByTitle>): string | null => (r && "title" in r ? r.title : null);
  it("por código exacto y por título", () => {
    expect(findPropiedadByCodigo(s, "ln-1024")?.title).toBe("Casa Las Lomas");
    expect(titleOf(findPropiedadByTitle(s, "las lomas"))).toBe("Casa Las Lomas");
    expect(findPropiedadByTitle(s, "no existe")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("respeta comillas con comas y saltos de línea adentro", () => {
    const rows = parseCsv('titulo,zona\n"Casa, grande",Centro\n"Depto\ncon vista",Sur');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["Casa, grande", "Centro"]);
    expect(rows[2]).toEqual(["Depto\ncon vista", "Sur"]);
  });

  it("autodetecta tab (pegado desde Excel) y punto y coma", () => {
    expect(parseCsv("titulo\tzona\nCasa\tCentro")[1]).toEqual(["Casa", "Centro"]);
    expect(parseCsv("titulo;zona\nCasa;Centro")[1]).toEqual(["Casa", "Centro"]);
  });

  it("escapa comilla doble", () => {
    expect(parseCsv('a\n"dijo ""hola"""')[1]).toEqual(['dijo "hola"']);
  });
});

describe("parseNum (formatos de precio)", () => {
  it("interpreta miles y decimales", () => {
    expect(parseNum("$1,250,000")).toBe(1_250_000);
    expect(parseNum("1.250.000")).toBe(1_250_000);
    expect(parseNum("12,500 MXN")).toBe(12_500);
    expect(parseNum("3200")).toBe(3200);
    expect(parseNum("2,500.50")).toBe(2500.5);
    expect(parseNum("")).toBeNull();
  });
});

describe("mapCsvToPropiedades", () => {
  it("mapea por encabezados (es/en) y normaliza", () => {
    const csv = [
      "titulo,operacion,tipo,zona,precio,moneda,recamaras,estatus,referencia",
      "Casa Bonita,En venta,Casa,Las Lomas,\"$3,200,000\",MXN,3 rec,Disponible,LN-1",
      "Depto Centro,renta,departamento,Centro,12500,,2,disponible,LN-2",
    ].join("\n");
    const r = mapCsvToPropiedades(csv, "https://x/feed");
    expect(r.byHeader).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.props).toHaveLength(2);
    expect(r.props[0]!.operacion).toBe("venta");
    expect(r.props[0]!.precio).toBe(3_200_000);
    expect(r.props[0]!.recamaras).toBe(3);
    expect(r.props[1]!.operacion).toBe("renta");
    expect(r.props[1]!.moneda).toBe("MXN");
  });

  it("reporta la fila mala y sigue con las demás", () => {
    const csv = ["titulo,precio,zona", "Casa A,1000,Centro", ",,", "Sin datos,,", "Casa B,2000,Sur"].join("\n");
    const r = mapCsvToPropiedades(csv);
    expect(r.props.map((p) => p.title)).toEqual(["Casa A", "Casa B"]);
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("sin encabezados usa el orden canónico", () => {
    const rows = ["Casa X,venta,casa,Centro,1500000,MXN,3,2,1,150,200,disponible,REF-9,,,,"];
    const r = mapCsvToPropiedades(rows.join("\n"));
    expect(r.byHeader).toBe(false);
    expect(r.props).toHaveLength(1);
    expect(r.props[0]!.title).toBe("Casa X");
    expect(r.props[0]!.precio).toBe(1_500_000);
    expect(r.props[0]!.codigo).toBe("REF-9");
  });

  it("el encabezado canónico es estable (es el de la plantilla)", () => {
    expect(csvHeader()).toContain("titulo,operacion,tipo,zona,precio");
  });
});

describe("buildPropiedadesResumen", () => {
  it("arma el doc de la KB con párrafos y sin propiedades si está vacío", () => {
    expect(buildPropiedadesResumen({ updatedAt: 0, props: {} })).toBe("");
    const doc = buildPropiedadesResumen(store([mk({ title: "Casa", key: "a" })]));
    expect(doc).toContain("# Inventario de propiedades (1)");
    expect(doc).toContain("\n\n");
    expect(doc).toContain("buscarPropiedad");
  });
});
