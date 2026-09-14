import { describe, it, expect } from "vitest";
import {
  haversineKm,
  zoneKey,
  matchZone,
  pickBase,
  estimateFare,
  parseDriverCommand,
  validCoords,
} from "../../src/taxi/dispatch";
import type { TaxiBase } from "../../src/db/taxi";

const base = (over: Partial<TaxiBase>): TaxiBase => ({
  id: "b1",
  name: "Centro",
  address: null,
  lat: null,
  lng: null,
  zones: null,
  base_fare: 0,
  eta_min: 10,
  is_default: 0,
  active: 1,
  sort_order: 0,
  created_at: 0,
  updated_at: 0,
  ...over,
});

describe("haversineKm / validCoords", () => {
  it("mide 0 entre el mismo punto y ~111 km por grado de latitud", () => {
    expect(haversineKm({ lat: 10, lng: -66 }, { lat: 10, lng: -66 })).toBe(0);
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(110);
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(112);
  });

  it("validCoords rechaza NaN y fuera de rango", () => {
    expect(validCoords({ lat: 10, lng: 20 })).toBe(true);
    expect(validCoords({ lat: NaN, lng: 20 })).toBe(false);
    expect(validCoords({ lat: 999, lng: 20 })).toBe(false);
    expect(validCoords(null)).toBe(false);
  });
});

describe("zoneKey / matchZone", () => {
  it("normaliza acentos, mayúsculas y signos", () => {
    expect(zoneKey("  Centro  ")).toBe("centro");
    expect(zoneKey("Zona Norte")).toBe("zona norte");
    expect(zoneKey("María")).toBe("maria");
  });

  it("matchea la zona por nombre exacto o por contención", () => {
    const b = base({ zones: JSON.stringify([{ name: "Centro", fee: 20 }, { name: "Zona Norte", fee: 35 }]) });
    expect(matchZone(b, "centro")?.fee).toBe(20);
    expect(matchZone(b, "aurora norte")?.name).toBe("Zona Norte"); // "norte" incluido
    expect(matchZone(b, "sur lejano")).toBeNull();
    expect(matchZone(base({ zones: "{basura" }), "centro")).toBeNull();
  });
});

describe("pickBase", () => {
  const centro = base({ id: "centro", name: "Centro", lat: 10, lng: -66, zones: JSON.stringify([{ name: "Centro", fee: 15 }]) });
  const norte = base({ id: "norte", name: "Norte", lat: 10.2, lng: -66, zones: JSON.stringify([{ name: "Zona Norte", fee: 30 }]) });
  const sur = base({ id: "sur", name: "Sur", lat: 9, lng: -66, zones: JSON.stringify([{ name: "Sur", fee: 25 }]) });

  it("con coordenadas elige la base con conductores más cercana", () => {
    const pick = pickBase({ bases: [centro, norte, sur], waitingByBase: { centro: 2, norte: 1 }, location: { lat: 10.15, lng: -66 } });
    expect(pick.base?.id).toBe("norte");
    expect(pick.reason).toBe("gps");
  });

  it("ignora bases sin conductores al elegir por GPS", () => {
    const pick = pickBase({ bases: [centro, norte], waitingByBase: { centro: 1 }, location: { lat: 10.19, lng: -66 } });
    expect(pick.base?.id).toBe("centro"); // norte está más cerca pero no tiene cola
  });

  it("sin coordenadas usa la zona escrita y devuelve su tarifa", () => {
    const pick = pickBase({ bases: [centro, norte], waitingByBase: { centro: 1, norte: 1 }, zoneText: "zona norte" });
    expect(pick.base?.id).toBe("norte");
    expect(pick.zone?.fee).toBe(30);
    expect(pick.reason).toBe("zone");
  });

  it("cae a la base default si la zona no matchea", () => {
    const def = base({ id: "def", is_default: 1, zones: "[]" });
    const pick = pickBase({ bases: [centro, def], waitingByBase: { centro: 1, def: 1 }, zoneText: "Marte" });
    expect(pick.base?.id).toBe("def");
    expect(pick.reason).toBe("default");
  });

  it("sin default usa la base con más conductores esperando", () => {
    const pick = pickBase({ bases: [centro, norte], waitingByBase: { centro: 1, norte: 3 }, zoneText: "Marte" });
    expect(pick.base?.id).toBe("norte");
    expect(pick.reason).toBe("busiest");
  });

  it("si ninguna base tiene conductores → none", () => {
    const pick = pickBase({ bases: [centro, norte], waitingByBase: {}, location: { lat: 10.1, lng: -66 } });
    expect(pick.base).toBeNull();
    expect(pick.reason).toBe("none");
  });

  it("ignora bases inactivas", () => {
    const pick = pickBase({ bases: [base({ id: "x", active: 0 })], waitingByBase: { x: 3 }, zoneText: "Centro" });
    expect(pick.base).toBeNull();
  });
});

describe("estimateFare", () => {
  it("suma tarifa base + tarifa de zona", () => {
    expect(estimateFare(base({ base_fare: 10 }), { name: "Centro", fee: 15 })).toBe(25);
    expect(estimateFare(base({ base_fare: 10 }), null)).toBe(10);
  });
});

describe("parseDriverCommand", () => {
  it("por defecto cualquier mensaje es 'llegué' → enqueue", () => {
    expect(parseDriverCommand("llegué")).toBe("enqueue");
    expect(parseDriverCommand("342")).toBe("enqueue");
    expect(parseDriverCommand("")).toBe("enqueue");
    expect(parseDriverCommand(undefined)).toBe("enqueue");
  });

  it("reconoce salir / fin / estado", () => {
    expect(parseDriverCommand("me voy a descansar")).toBe("leave");
    expect(parseDriverCommand("salir de la cola")).toBe("leave");
    expect(parseDriverCommand("terminé el viaje")).toBe("finish");
    expect(parseDriverCommand("listo")).toBe("finish");
    expect(parseDriverCommand("cuál es mi posición?")).toBe("status");
  });
});
