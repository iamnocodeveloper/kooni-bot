import { describe, it, expect } from "vitest";
import { makeT, panelLang, clearPanelLangCache } from "../../src/admin/i18n";
import { es } from "../../src/admin/locales/es";
import { en } from "../../src/admin/locales/en";

describe("i18n del panel", () => {
  it("el español es el default (sin env/DB)", async () => {
    clearPanelLangCache();
    expect(await panelLang(undefined)).toBe("es");
    expect(makeT("es")("nav.comentarios")).toBe("Comentarios");
  });

  it("traduce al inglés las claves del core", () => {
    const t = makeT("en");
    expect(t("nav.comentarios")).toBe("Comments");
    expect(t("chrome.logout")).toBe("Sign out");
    expect(t("chrome.online")).toBe("BOT ONLINE");
  });

  it("interpola variables", () => {
    // clave con placeholder: se usa un texto del dict con {x} si existe
    const t = makeT("es");
    expect(t("nav.overview")).toBe("Resumen");
  });

  it("una clave inexistente devuelve la clave (no rompe)", () => {
    // @ts-expect-error clave a propósito inexistente
    expect(makeT("es")("no.existe")).toBe("no.existe");
  });

  it("es y en tienen EXACTAMENTE las mismas claves", () => {
    const kEs = Object.keys(es).sort();
    const kEn = Object.keys(en).sort();
    expect(kEn).toEqual(kEs);
  });
});
