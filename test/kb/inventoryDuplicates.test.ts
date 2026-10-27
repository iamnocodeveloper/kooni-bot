import { describe, it, expect } from "vitest";
import {
  extractDetailsFromHtml,
  vehicleKey,
  queryInventory,
  type StoredVehicle,
  type VehicleStore,
} from "../../src/kb/inventory";
import { applyCorrections, findNearDuplicates, parseCorrections } from "../../src/kb/analysis";

function v(partial: Partial<StoredVehicle> & { key: string }): StoredVehicle {
  return {
    vin: null,
    title: "2022 Kia Sorento LX",
    year: 2022,
    make: "Kia",
    model: "Sorento LX",
    trim: "LX",
    description: null,
    condition: "Usado",
    price: 25000,
    miles: 30000,
    listingUrl: null,
    feedUrl: "https://x/feed",
    imageUrl: null,
    imgStatus: "pendiente",
    imgAt: null,
    changedAt: 0,
    ...partial,
  };
}

function store(...vs: StoredVehicle[]): VehicleStore {
  const vehicles: Record<string, StoredVehicle> = {};
  for (const x of vs) vehicles[x.key] = x;
  return { updatedAt: 0, vehicles };
}

describe("vehicleKey — no colapsa autos sin VIN ni link", () => {
  it("usa el discriminador (título/precio/millas) cuando no hay VIN ni ficha", () => {
    const a = vehicleKey(null, null, "2022 Kia Sorento SX|25000|30000|Usado");
    const b = vehicleKey(null, null, "2022 Kia Sorento SX|27000|20000|Usado");
    expect(a).not.toBe(b);
    // Sin discriminador sigue habiendo un bucket estable (para compatibilidad).
    expect(vehicleKey(null, null, null)).toBe(vehicleKey(null, null, ""));
  });
});

describe("descripción y versión desde la ficha", () => {
  it("extrae description + vehicleConfiguration del JSON-LD", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type":"Car","name":"2022 Kia Sorento","vehicleConfiguration":"SX Prestige",
       "description":"SUV de 3 filas con techo panorámico, cuero y asientos ventilados.",
       "offers":{"price":34900},"mileageFromOdometer":{"value":21000}}
    </script></head></html>`;
    const d = extractDetailsFromHtml(html);
    expect(d.trim).toBe("SX Prestige");
    expect(d.description).toContain("techo panorámico");
    expect(d.price).toBe(34900);
    expect(d.miles).toBe(21000);
  });
});

describe("análisis IA — duplicados vs versiones distintas", () => {
  it("agrupa autos con el mismo año/marca/modelo base", () => {
    const groups = findNearDuplicates([
      v({ key: "url:a", model: "Sorento LX", trim: "LX" }),
      v({ key: "url:b", model: "Sorento SX", trim: "SX" }),
      v({ key: "url:c", title: "2023 Kia Telluride SX", year: 2023, model: "Telluride SX" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((x) => x.key).sort()).toEqual(["url:a", "url:b"]);
  });

  it("marca duplicadoDe solo si NINGUNO tiene VIN", () => {
    const a = v({ key: "url:a", vin: null });
    const b = v({ key: "url:b", vin: null });
    const withVin = v({ key: "url:c", vin: "5XYPKDA58PG242135" });

    const corr = parseCorrections([{ key: "url:a", duplicadoDe: "url:b" }], [a, b]);
    expect(corr[0].duplicadoDe).toBe("url:b");

    const st = store(a, b);
    applyCorrections(st, corr);
    expect(st.vehicles["url:a"].duplicateOf).toBe("url:b");

    const unsafe = parseCorrections([{ key: "url:a", duplicadoDe: "url:c" }], [a, withVin]);
    // Objetos nuevos: `applyCorrections` muta el store y no queremos arrastrar
    // el `duplicateOf` del caso anterior.
    const a2 = v({ key: "url:a", vin: null });
    const st2 = store(a2, withVin);
    applyCorrections(st2, unsafe);
    expect(st2.vehicles["url:a"].duplicateOf).toBeUndefined();
  });

  it("acepta trim y description como correcciones", () => {
    const a = v({ key: "url:a" });
    const corr = parseCorrections(
      [{ key: "url:a", trim: "SX Prestige", description: "Versión tope de línea con techo panorámico." }],
      [a],
    );
    expect(corr[0].trim).toBe("SX Prestige");
    expect(corr[0].description).toContain("techo panorámico");
  });

  it("queryInventory oculta los marcados como duplicados", () => {
    const st = store(
      v({ key: "url:a" }),
      v({ key: "url:b", duplicateOf: "url:a" }),
    );
    const res = queryInventory(st, {}, 25, 0);
    expect(res.total).toBe(1);
    expect(res.matches[0].key).toBe("url:a");
  });
});
