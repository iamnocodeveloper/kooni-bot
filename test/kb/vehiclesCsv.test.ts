import { describe, it, expect } from "vitest";
import {
  mapCsvToVehicles,
  mergeCsvVehicles,
  normCondicion,
  vehicleCsvHeader,
  CSV_FEED,
} from "../../src/kb/vehiclesCsv";
import { mergeVehicleStore, queryInventory, type Vehicle, type VehicleStore } from "../../src/kb/inventory";

const NOW = 1_700_000_000_000;
const HEADER = "vin,anio,marca,modelo,version,condicion,precio,millas,link,imagen";
const emptyStore = (): VehicleStore => ({ updatedAt: 0, vehicles: {} });

describe("mapCsvToVehicles", () => {
  it("mapea por encabezados, arma el título y normaliza condición, precio y millas", () => {
    const csv = [
      HEADER,
      "1HGCM82633A004352,2022,Kia,Sorento,SX,usado,\"$28,500\",\"41,200\",https://x.com/sorento,https://x.com/s.jpg",
      ",2024,Toyota,RAV4,LE,nuevo,32.990,0,,",
    ].join("\n");
    const r = mapCsvToVehicles(csv, NOW);
    expect(r.byHeader).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.vehicles).toHaveLength(2);

    const [a, b] = r.vehicles;
    expect(a).toMatchObject({
      vin: "1HGCM82633A004352",
      title: "2022 Kia Sorento SX",
      year: 2022,
      make: "Kia",
      model: "Sorento",
      condition: "Usado",
      price: 28500,
      miles: 41200,
      listingUrl: "https://x.com/sorento",
      imageUrl: "https://x.com/s.jpg",
      imgStatus: "ok",
      feedUrl: CSV_FEED,
      source: "csv",
    });
    expect(a.key).toBe("vin:1HGCM82633A004352");
    // Sin VIN ni link: la llave sale del título y es estable.
    expect(b).toMatchObject({ vin: null, title: "2024 Toyota RAV4 LE", condition: "Nuevo", price: 32990, miles: 0 });
    expect(b.key.startsWith("url:")).toBe(true);
    expect(b.imgStatus).toBe("pendiente");
    expect(mapCsvToVehicles(csv, NOW + 5).vehicles[1].key).toBe(b.key);
  });

  it("acepta encabezados en inglés, tabulado de Excel y punto y coma", () => {
    const tsv = "VIN\tYear\tMake\tModel\tCondition\tPrice\tMileage\n1HGCM82633A004352\t2020\tHonda\tCivic\tUsed\t18900\t60000";
    const t = mapCsvToVehicles(tsv, NOW);
    expect(t.vehicles[0]).toMatchObject({ title: "2020 Honda Civic", condition: "Usado", price: 18900, miles: 60000 });

    const semi = "marca;modelo;anio;precio\nMazda;CX-5;2021;27000";
    expect(mapCsvToVehicles(semi, NOW).vehicles[0]).toMatchObject({ title: "2021 Mazda CX-5", price: 27000 });
  });

  it("una columna 'titulo' manda sobre marca/modelo", () => {
    const csv = "titulo,precio,condicion,marca\n2019 Chevrolet Silverado LT Crew Cab,31500,usado,Chevrolet";
    expect(mapCsvToVehicles(csv, NOW).vehicles[0].title).toBe("2019 Chevrolet Silverado LT Crew Cab");
  });

  it("sin encabezados usa el orden canónico y salta una primera fila que sea encabezado parcial", () => {
    const csv = "1HGCM82633A004352,2018,Nissan,Versa,S,usado,9900,72000";
    expect(mapCsvToVehicles(csv, NOW).vehicles[0]).toMatchObject({ title: "2018 Nissan Versa S", price: 9900, miles: 72000 });
    const withVinHeader = "vin,x\n1HGCM82633A004352,2018,Nissan,Versa";
    // 'vin' reconocido pero <3 columnas: es posicional y se salta la 1ª fila.
    expect(mapCsvToVehicles(withVinHeader, NOW).vehicles).toHaveLength(1);
  });

  it("no aborta por filas malas: las reporta con su línea y sigue", () => {
    const csv = [
      HEADER,
      ",,,,,usado,5000,100,,", // hay datos pero no marca/modelo → sin título
      "BADVIN-OOO,2021,Ford,Escape,SE,usado,22000,30000,,", // VIN inválido: se importa sin VIN
      "",
      "1HGCM82633A004352,2023,Hyundai,Elantra,SEL,nuevo,24000,5,,",
    ].join("\n");
    const r = mapCsvToVehicles(csv, NOW);
    expect(r.vehicles.map((v) => v.title)).toEqual(["2021 Ford Escape SE", "2023 Hyundai Elantra SEL"]);
    expect(r.vehicles[0].vin).toBeNull();
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatchObject({ line: 2 });
    expect(r.errors[0].motivo).toContain("sin título");
    expect(r.errors[1]).toMatchObject({ line: 3 });
    expect(r.errors[1].motivo).toContain("VIN inválido");
  });

  it("ignora precios cero o negativos, links que no son http y años fuera de rango", () => {
    const csv = `${HEADER}\n,1850,Ford,T,,usado,0,-5,javascript:alert(1),ftp://x`;
    const v = mapCsvToVehicles(csv, NOW).vehicles[0];
    expect(v.year).toBeNull();
    expect(v.title).toBe("Ford T");
    expect(v.price).toBeNull();
    expect(v.miles).toBeNull();
    expect(v.listingUrl).toBeNull();
    expect(v.imageUrl).toBeNull();
  });

  it("texto vacío → nada", () => {
    expect(mapCsvToVehicles("", NOW)).toEqual({ vehicles: [], errors: [], byHeader: false });
  });

  it("la plantilla de docs encaja con el encabezado canónico", () => {
    expect(vehicleCsvHeader()).toBe(HEADER);
  });
});

describe("normCondicion", () => {
  it.each([
    ["Nuevo", "Nuevo"],
    ["new", "Nuevo"],
    ["Usado", "Usado"],
    ["seminuevo", "Usado"],
    ["Pre-Owned", "Usado"],
    ["certified", "Certificado"],
    ["CPO", "Certificado"],
    ["certificado", "Certificado"],
    ["otra cosa", null],
    ["", null],
  ])("%s → %s", (raw, want) => {
    expect(normCondicion(raw)).toBe(want);
  });
});

describe("mergeCsvVehicles", () => {
  const csv = (rows: string[]) => mapCsvToVehicles([HEADER, ...rows].join("\n"), NOW).vehicles;

  it("agrega, y al reimportar actualiza por llave sin duplicar", () => {
    const first = mergeCsvVehicles(emptyStore(), csv(["1HGCM82633A004352,2022,Kia,Sorento,SX,usado,28500,41200,,"]));
    expect(first.added).toBe(1);
    const again = mergeCsvVehicles(first.store, csv(["1HGCM82633A004352,2022,Kia,Sorento,SX,usado,27900,41200,,"]));
    expect(again.added).toBe(0);
    expect(again.updated).toBe(1);
    expect(Object.keys(again.store.vehicles)).toHaveLength(1);
    expect(Object.values(again.store.vehicles)[0].price).toBe(27900);
  });

  it("conserva la foto guardada si el CSV nuevo no trae una", () => {
    const first = mergeCsvVehicles(emptyStore(), csv(["1HGCM82633A004352,2022,Kia,Sorento,SX,usado,28500,1,,https://x.com/a.jpg"]));
    const again = mergeCsvVehicles(first.store, csv(["1HGCM82633A004352,2022,Kia,Sorento,SX,usado,28500,1,,"]));
    const v = Object.values(again.store.vehicles)[0];
    expect(v.imageUrl).toBe("https://x.com/a.jpg");
    expect(v.imgStatus).toBe("ok");
  });

  it("'reemplazar' quita los autos de CSV que ya no vienen (vendidos), no los del scraping", () => {
    const scraped: Vehicle = {
      key: "vin:SCRAPED00000000001",
      vin: "SCRAPED00000000001",
      title: "2021 Jeep Wrangler",
      year: 2021,
      make: "Jeep",
      model: "Wrangler",
      condition: "Usado",
      price: 40000,
      miles: 1000,
      listingUrl: "https://dealer.com/jeep",
      feedUrl: "https://dealer.com/inv",
    };
    let store = mergeVehicleStore(emptyStore(), [scraped]);
    store = mergeCsvVehicles(store, csv(["1HGCM82633A004352,2022,Kia,Sorento,SX,usado,28500,1,,", "2HGCM82633A004353,2023,Kia,Soul,LX,nuevo,21000,0,,"])).store;
    expect(Object.keys(store.vehicles)).toHaveLength(3);

    const replaced = mergeCsvVehicles(store, csv(["2HGCM82633A004353,2023,Kia,Soul,LX,nuevo,21000,0,,"]), { replace: true }).store;
    expect(Object.keys(replaced.vehicles).sort()).toEqual(["vin:2HGCM82633A004353", "vin:SCRAPED00000000001"]);
  });

  it("un VIN que ya trae el scraping solo se completa, no cambia de origen", () => {
    const scraped: Vehicle = {
      key: "vin:1HGCM82633A004352",
      vin: "1HGCM82633A004352",
      title: "2022 Kia Sorento SX",
      year: 2022,
      make: "Kia",
      model: "Sorento",
      condition: null,
      price: null,
      miles: null,
      listingUrl: "https://dealer.com/s",
      feedUrl: "https://dealer.com/inv",
    };
    const store = mergeVehicleStore(emptyStore(), [scraped]);
    const out = mergeCsvVehicles(store, csv(["1HGCM82633A004352,2022,Kia,Sorento,SX,usado,28500,41200,,"])).store;
    const v = out.vehicles["vin:1HGCM82633A004352"];
    expect(v.source).toBeUndefined();
    expect(v.feedUrl).toBe("https://dealer.com/inv");
    expect(v).toMatchObject({ price: 28500, miles: 41200, condition: "Usado" });
  });
});

describe("el scraping no borra los autos cargados por CSV", () => {
  it("mergeVehicleStore conserva source=csv aunque el feed no los traiga", () => {
    const csvStore = mergeCsvVehicles(emptyStore(), mapCsvToVehicles(`${HEADER}\n1HGCM82633A004352,2022,Kia,Sorento,SX,usado,28500,1,,`, NOW).vehicles).store;
    const feedCar: Vehicle = {
      key: "vin:FEEDCAR0000000001",
      vin: "FEEDCAR0000000001",
      title: "2020 Ford F-150",
      year: 2020,
      make: "Ford",
      model: "F-150",
      condition: "Usado",
      price: 35000,
      miles: 22000,
      listingUrl: "https://dealer.com/f150",
      feedUrl: "https://dealer.com/inv",
    };
    const merged = mergeVehicleStore(csvStore, [feedCar]);
    expect(Object.keys(merged.vehicles).sort()).toEqual(["vin:1HGCM82633A004352", "vin:FEEDCAR0000000001"]);
    // Y un feed vacío (p. ej. el sitio cambió) tampoco los vacía.
    expect(Object.keys(mergeVehicleStore(merged, []).vehicles)).toEqual(["vin:1HGCM82633A004352"]);
  });

  it("los autos del CSV responden en inventarioQuery (marca, precio y marcas disponibles)", () => {
    const store = mergeCsvVehicles(
      emptyStore(),
      mapCsvToVehicles(
        [HEADER, "1HGCM82633A004352,2022,Kia,Sorento,SX,usado,28500,41200,,", "2HGCM82633A004353,2023,Toyota,Corolla,LE,nuevo,23000,0,,"].join("\n"),
        NOW,
      ).vehicles,
    ).store;
    const r = queryInventory(store, { marca: "kia", precioMax: 30000 });
    expect(r.total).toBe(1);
    expect(r.matches[0].title).toBe("2022 Kia Sorento SX");
    expect(r.marcas.map((m) => m.marca).sort()).toEqual(["Kia", "Toyota"]);
    expect(queryInventory(store, { marca: "Ferrari" }).total).toBe(0);
  });
});

describe("plantilla para el cliente", () => {
  it("docs/kb-plantillas/concesionario-inventario.csv se importa sin errores", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const text = readFileSync(join(process.cwd(), "docs", "kb-plantillas", "concesionario-inventario.csv"), "utf8");
    const r = mapCsvToVehicles(text, NOW);
    expect(r.byHeader).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.vehicles.map((v) => v.title)).toEqual([
      "2022 Kia Sorento SX",
      "2023 Toyota Tacoma TRD Sport",
      "2024 Hyundai Elantra SEL",
    ]);
    expect(r.vehicles.map((v) => v.price)).toEqual([28500, 36900, 24200]);
  });
});
