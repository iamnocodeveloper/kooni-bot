import { describe, it, expect } from "vitest";
import { diffVehicleStore, type StoredVehicle, type VehicleStore } from "../../src/kb/inventory";

function v(over: Partial<StoredVehicle> & { key: string; title: string }): StoredVehicle {
  return {
    vin: null,
    year: null,
    make: null,
    model: null,
    condition: "Usado",
    price: null,
    miles: null,
    listingUrl: null,
    feedUrl: "https://ejemplo.com/feed",
    imageUrl: null,
    imgStatus: "pendiente",
    imgAt: null,
    changedAt: 0,
    ...over,
  };
}

function store(...vs: StoredVehicle[]): VehicleStore {
  const vehicles: Record<string, StoredVehicle> = {};
  for (const x of vs) vehicles[x.key] = x;
  return { updatedAt: 0, vehicles };
}

describe("diffVehicleStore", () => {
  it("detecta nuevos, vendidos y cambios de campos", () => {
    const before = store(
      v({ key: "vin:A", title: "2020 Kia Sorento", vin: "A", price: 20000, miles: 10000 }),
      v({ key: "vin:B", title: "2019 Kia Forte", vin: "B", price: 15000 }),
      v({ key: "vin:C", title: "2018 Jeep Wrangler", vin: "C" }),
    );
    const after = store(
      v({ key: "vin:A", title: "2020 Kia Sorento LX", vin: "A", price: 19000, miles: 10000 }),
      v({ key: "vin:C", title: "2018 Jeep Wrangler", vin: "C" }),
      v({ key: "vin:D", title: "2022 Kia Telluride", vin: "D", price: 46000 }),
    );

    const d = diffVehicleStore(before, after);
    expect(d.added.map((x) => x.vin)).toEqual(["D"]);
    expect(d.removed.map((x) => x.vin)).toEqual(["B"]);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].vin).toBe("A");

    const fields = d.changed[0].fields.map((f) => f.field).sort();
    expect(fields).toEqual(["Precio", "Título"]);
    expect(d.changed[0].fields.find((f) => f.field === "Precio")).toMatchObject({
      from: "$20,000",
      to: "$19,000",
    });
  });

  it("mismo estado → diff vacío", () => {
    const s = store(v({ key: "vin:A", title: "Auto", vin: "A", price: 1000 }));
    expect(diffVehicleStore(s, s)).toEqual({ added: [], removed: [], changed: [] });
  });

  it("detecta cambio de condición, link y desglose de precio", () => {
    const before = store(
      v({ key: "vin:A", title: "Auto", vin: "A", condition: "Usado", listingUrl: "https://a" }),
    );
    const after = store(
      v({
        key: "vin:A",
        title: "Auto",
        vin: "A",
        condition: "Nuevo",
        listingUrl: "https://b",
        pricing: {
          listPrice: 30000,
          discount: null,
          dealerFee: null,
          adminFee: null,
          tagFee: null,
          transparentPrice: 28534,
        },
      }),
    );
    const d = diffVehicleStore(before, after);
    expect(d.changed[0].fields.map((f) => f.field).sort()).toEqual(["Condición", "Desglose", "Link"]);
  });

  it("un auto sin cambios no aparece en `changed`", () => {
    const before = store(v({ key: "vin:A", title: "Auto", vin: "A", price: 1000, miles: 10 }));
    const after = store(v({ key: "vin:A", title: "Auto", vin: "A", price: 1000, miles: 10 }));
    expect(diffVehicleStore(before, after).changed).toEqual([]);
  });
});
