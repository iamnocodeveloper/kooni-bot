import { describe, it, expect } from "vitest";
import {
  extractJson,
  parseCorrections,
  applyCorrections,
  findSuspiciousVehicles,
  selectBatch,
} from "../../src/kb/analysis";
import type { StoredVehicle, VehicleStore } from "../../src/kb/inventory";

function v(partial: Partial<StoredVehicle> & { key: string }): StoredVehicle {
  return {
    vin: "5XYPKDA58PG242135",
    title: "2022 Kia Telluride SX",
    year: 2022,
    make: "Kia",
    model: "Telluride SX",
    condition: "Usado",
    price: 32900,
    miles: 31000,
    listingUrl: "https://example.com/inventory/1",
    feedUrl: "https://example.com/inventory_sitemap",
    imageUrl: null,
    imgStatus: "pendiente",
    imgAt: null,
    changedAt: 0,
    ...partial,
  };
}

describe("extractJson", () => {
  it("lee un array JSON plano", () => {
    expect(extractJson('[{"key":"a"}]')).toEqual([{ key: "a" }]);
  });

  it("tolera bloques ```json y prosa alrededor", () => {
    const raw = 'Claro, aquí están:\n```json\n[{"key":"a","price":100}]\n```\nSaludos.';
    expect(extractJson(raw)).toEqual([{ key: "a", price: 100 }]);
  });

  it("devuelve null si no hay JSON válido", () => {
    expect(extractJson("")).toBeNull();
    expect(extractJson("no hay json acá")).toBeNull();
    expect(extractJson("[{roto]")).toBeNull();
  });
});

describe("parseCorrections", () => {
  const vehicles = [v({ key: "vin:A" }), v({ key: "vin:B", price: null })];

  it("acepta correcciones válidas solo de autos existentes", () => {
    const raw = [
      { key: "vin:A", price: 30000, motivo: "precio con impuesto incluido" },
      { key: "vin:NO-EXISTE", price: 1 },
    ];
    const out = parseCorrections(raw, vehicles);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("vin:A");
    expect(out[0].price).toBe(30000);
  });

  it("descarta valores fuera de rango", () => {
    const raw = [
      { key: "vin:A", year: 1492 },
      { key: "vin:A", price: -500 },
      { key: "vin:A", miles: 99_999_999 },
    ];
    expect(parseCorrections(raw, vehicles)).toHaveLength(0);
  });

  it("descarta correcciones que no cambian nada", () => {
    const raw = [{ key: "vin:A", price: 32900, title: "2022 Kia Telluride SX" }];
    expect(parseCorrections(raw, vehicles)).toHaveLength(0);
  });

  it("limpia números con símbolos y comas", () => {
    const raw = [{ key: "vin:B", price: "$30,500", miles: "45,200" }];
    const out = parseCorrections(raw, vehicles);
    expect(out[0].price).toBe(30500);
    expect(out[0].miles).toBe(45200);
  });

  it("acepta el envoltorio { correcciones: [...] }", () => {
    const raw = { correcciones: [{ key: "vin:B", price: 12000 }] };
    expect(parseCorrections(raw, vehicles)).toHaveLength(1);
  });

  it("ignora entradas basura", () => {
    expect(parseCorrections(null, vehicles)).toHaveLength(0);
    expect(parseCorrections([null, 42, "texto"], vehicles)).toHaveLength(0);
  });
});

describe("applyCorrections", () => {
  function store(): VehicleStore {
    return { updatedAt: 0, vehicles: { "vin:A": v({ key: "vin:A" }) } };
  }

  it("aplica y marca changedAt", () => {
    const s = store();
    const res = applyCorrections(s, [{ key: "vin:A", price: 30000, miles: 30000 }]);
    expect(res.applied).toBe(1);
    expect(res.fields).toBe(2);
    expect(s.vehicles["vin:A"].price).toBe(30000);
    expect(s.vehicles["vin:A"].changedAt).toBeGreaterThan(0);
  });

  it("NUNCA agrega ni elimina autos", () => {
    const s = store();
    applyCorrections(s, [{ key: "vin:A", price: 1 }, { key: "vin:INVENTADO", price: 1 }]);
    expect(Object.keys(s.vehicles)).toEqual(["vin:A"]);
  });
});

describe("findSuspiciousVehicles / selectBatch", () => {
  it("marca autos sin VIN, sin precio, sin año o con título basura", () => {
    const list = [
      v({ key: "ok1" }),
      v({ key: "sinPrecio", price: null }),
      v({ key: "sinVin", vin: null }),
      v({ key: "basura", title: "Ver más" }),
    ];
    const keys = findSuspiciousVehicles(list).map((x) => x.key);
    expect(keys).toEqual(["sinPrecio", "sinVin", "basura"]);
  });

  it("selectBatch prioriza los sospechosos y respeta el límite", () => {
    const list = [
      v({ key: "ok1" }),
      v({ key: "ok2" }),
      v({ key: "malo", price: null }),
    ];
    const batch = selectBatch(list, 2);
    expect(batch).toHaveLength(2);
    expect(batch[0].key).toBe("malo");
  });
});
