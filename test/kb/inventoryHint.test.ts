import { describe, it, expect } from "vitest";
import { inventoryHintBlock } from "../../src/kb/inventoryHint";
import { mapCsvToVehicles } from "../../src/kb/vehiclesCsv";

const cars = mapCsvToVehicles(
  "marca,modelo,anio,precio\nKia,Sorento,2022,28500\nToyota,RAV4,2021,27900\nKia,Soul,2023,21000",
).vehicles;

describe("inventoryHintBlock", () => {
  // `expectsInventory: false` = sin URLs de Web Sync ni giro concesionario, p. ej.
  // un inventario cargado solo por CSV: antes ese caso quedaba sin regla.
  it("con autos cargados obliga a usar inventarioQuery/fichaAuto y lista marcas sin repetir", () => {
    const hint = inventoryHintBlock({ vehicles: cars, expectsInventory: false })!;
    expect(hint).toContain("<inventario>");
    expect(hint).toContain("3 autos");
    expect(hint).toContain("Marcas: Kia, Toyota.");
    expect(hint).toContain("inventarioQuery");
    expect(hint).toContain("fichaAuto");
  });

  it("sin autos pero esperando inventario prohíbe inventar", () => {
    const hint = inventoryHintBlock({ vehicles: [], expectsInventory: true })!;
    expect(hint).toContain("<inventario_vacio>");
    expect(hint).toContain("NO recites marcas ni modelos");
  });

  it("sin autos y sin inventario esperado (otros giros) no agrega nada", () => {
    expect(inventoryHintBlock({ vehicles: [], expectsInventory: false })).toBeNull();
  });
});
