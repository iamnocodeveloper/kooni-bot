import { describe, it, expect, beforeAll } from "vitest";
import { generateLicenseV2, verifyLicense, verifyLicenseFor, inspectLicense } from "../src/license";
import type { Env } from "../src/env";
import { generateKeyPairSync } from "node:crypto";

// Par Ed25519 de PRUEBA (los tests inyectan su pública vía env.LICENSE_PUBLIC_KEY).
let PRIV = "";
let PUB = "";
let env: Env;

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  PRIV = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  PUB = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  env = { LICENSE_PUBLIC_KEY: PUB } as unknown as Env;
});

describe("generateLicenseV2 / verifyLicense", () => {
  it("genera y valida un código lifetime (v2)", () => {
    const code = generateLicenseV2(PRIV, { kind: "lifetime" });
    expect(code.startsWith("KOONI-PRO-V2-")).toBe(true);
    const payload = verifyLicense(code, env);
    expect(payload?.kind).toBe("lifetime");
  });

  it("rechaza un código con firma inválida (manipulado)", () => {
    const code = generateLicenseV2(PRIV, { kind: "lifetime" });
    const tampered = code.slice(0, -4) + "beef";
    expect(verifyLicense(tampered, env)).toBeNull();
  });

  it("rechaza un código firmado con OTRA llave privada", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const otherPriv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const code = generateLicenseV2(otherPriv, { kind: "lifetime" });
    expect(verifyLicense(code, env)).toBeNull();
  });

  it("rechaza el formato v1 (HMAC) — desactivado", () => {
    expect(verifyLicense("KOONI-PRO-eyJraW5kIjoibGlmZXRpbWUifQ.deadbeef", env)).toBeNull();
  });

  it("valida monthly dentro de la fecha y la rechaza cuando pasó la gracia", () => {
    const future = Date.now() + 30 * 86_400_000;
    const code = generateLicenseV2(PRIV, { kind: "monthly", expiry: future });
    expect(verifyLicense(code, env)?.kind).toBe("monthly");
    const wayPast = Date.now() - 10 * 86_400_000; // > 7 días de gracia
    const expired = generateLicenseV2(PRIV, { kind: "monthly", expiry: wayPast });
    expect(verifyLicense(expired, env)).toBeNull();
  });

  it("monthly recién vencida sigue activa dentro del periodo de gracia (7 días)", () => {
    const past2d = Date.now() - 2 * 86_400_000;
    const code = generateLicenseV2(PRIV, { kind: "monthly", expiry: past2d });
    expect(verifyLicense(code, env)?.kind).toBe("monthly"); // gracia
    expect(inspectLicense(code, env).state).toBe("grace");
  });
});

describe("inspectLicense (estado para el panel)", () => {
  it("lifetime → active, sin vencimiento", () => {
    const ins = inspectLicense(generateLicenseV2(PRIV, { kind: "lifetime" }), env);
    expect(ins.state).toBe("active");
    expect(ins.expiresAt).toBeNull();
    expect(ins.daysLeft).toBeNull();
  });

  it("monthly vigente → active con daysLeft > 0", () => {
    const exp = Date.now() + 12 * 86_400_000;
    const ins = inspectLicense(generateLicenseV2(PRIV, { kind: "monthly", expiry: exp }), env);
    expect(ins.state).toBe("active");
    expect(ins.daysLeft).toBeGreaterThan(10);
  });

  it("monthly pasada la gracia → expired", () => {
    const ins = inspectLicense(generateLicenseV2(PRIV, { kind: "monthly", expiry: Date.now() - 20 * 86_400_000 }), env);
    expect(ins.state).toBe("expired");
  });

  it("código basura → invalid", () => {
    expect(inspectLicense("no-es-un-codigo", env).state).toBe("invalid");
    expect(inspectLicense("KOONI-PRO-V2-abc.def", env).state).toBe("invalid");
  });
});

describe("verifyLicenseFor (ligada a instalación)", () => {
  it("valida con inst correcto y rechaza con otro", () => {
    const code = generateLicenseV2(PRIV, { kind: "lifetime", inst: "948b8b" });
    expect(verifyLicenseFor(env, code, { instanceUid: "948b8b" })).toBe(true);
    expect(verifyLicenseFor(env, code, { instanceUid: "aaaa11" })).toBe(false);
  });
});
