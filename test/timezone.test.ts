import { describe, it, expect } from "vitest";
import {
  isValidTimeZone,
  resolveBusinessTimezone,
  nowInTz,
  DEFAULT_BUSINESS_TZ,
  COMMON_TIMEZONES,
} from "../src/timezone";
import { SETTING_KEYS } from "../src/db/settings";

const envWith = (tz?: string) => ({ CALCOM_TIMEZONE: tz }) as any;

describe("isValidTimeZone", () => {
  it("acepta zonas IANA reales", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("America/Guayaquil")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });
  it("rechaza basura (un typo no debe llegar a la agenda)", () => {
    expect(isValidTimeZone("America/Nueva_York")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
  });
});

describe("resolveBusinessTimezone", () => {
  it("el setting del panel manda sobre la var legacy", () => {
    const s = { [SETTING_KEYS.businessTimezone]: "America/New_York" };
    expect(resolveBusinessTimezone(s, envWith("America/Bogota"))).toBe("America/New_York");
  });

  it("sin setting cae a CALCOM_TIMEZONE (instalaciones previas)", () => {
    expect(resolveBusinessTimezone({}, envWith("America/Bogota"))).toBe("America/Bogota");
  });

  it("sin nada usa el default", () => {
    expect(resolveBusinessTimezone({}, envWith())).toBe(DEFAULT_BUSINESS_TZ);
    expect(resolveBusinessTimezone({}, envWith(""))).toBe(DEFAULT_BUSINESS_TZ);
  });

  it("una zona inválida se IGNORA en vez de romper las citas", () => {
    const s = { [SETTING_KEYS.businessTimezone]: "America/Nueva_York" };
    expect(resolveBusinessTimezone(s, envWith("America/Bogota"))).toBe("America/Bogota");
    expect(resolveBusinessTimezone(s, envWith("zona/mala"))).toBe(DEFAULT_BUSINESS_TZ);
  });

  it("todas las zonas ofrecidas en el panel son válidas", () => {
    for (const tz of COMMON_TIMEZONES) expect(isValidTimeZone(tz)).toBe(true);
  });
});

describe("nowInTz", () => {
  it("da fecha larga + ISO + zona, y la hora con offset", () => {
    // 2026-09-14T15:34Z → 11:34 en New York (EDT, UTC-4).
    const now = new Date("2026-09-14T15:34:00Z");
    const r = nowInTz("America/New_York", now);
    expect(r.dateLine).toContain("2026-09-14");
    expect(r.dateLine).toContain("America/New_York");
    expect(r.timeLine).toContain("11:34");
    expect(r.timeLine).toContain("UTC-04:00");
  });

  it("la fecha NO incluye la hora (es lo que permite cachear el prompt)", () => {
    // Dos instantes del MISMO día local en New York (08:00 y 19:00 EDT).
    const a = nowInTz("America/New_York", new Date("2026-09-14T12:00:00Z"));
    const b = nowInTz("America/New_York", new Date("2026-09-14T23:00:00Z"));
    expect(a.dateLine).toBe(b.dateLine);
    expect(a.timeLine).not.toBe(b.timeLine);
  });

  it("respeta el cambio de día según la zona", () => {
    // 01:00 UTC del 15 = 21:00 del 14 en New York.
    const r = nowInTz("America/New_York", new Date("2026-09-15T01:00:00Z"));
    expect(r.dateLine).toContain("2026-09-14");
    expect(r.timeLine).toContain("21:00");
  });
});
