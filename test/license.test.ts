import { describe, it, expect } from "vitest";
import { generateLicense, verifyLicense, verifyLicenseFor } from "../src/license";
import type { Env } from "../src/env";

const SECRET = "test-master-key";
const env = { LICENSE_MASTER_KEY: SECRET } as unknown as Env;

describe("generateLicense / verifyLicense", () => {
  it("genera y valida un código lifetime", () => {
    const code = generateLicense(SECRET, { kind: "lifetime" });
    expect(code.startsWith("KOONI-PRO-")).toBe(true);
    const payload = verifyLicense(code, env);
    expect(payload?.kind).toBe("lifetime");
  });

  it("rechaza un código con firma inválida", () => {
    const code = generateLicense(SECRET, { kind: "lifetime" });
    const tampered = code.slice(0, -4) + "beef";
    expect(verifyLicense(tampered, env)).toBeNull();
  });

  it("rechaza un código sin master key configurada", () => {
    const code = generateLicense(SECRET, { kind: "lifetime" });
    expect(verifyLicense(code, {} as unknown as Env)).toBeNull();
  });

  it("valida monthly dentro de la fecha y la rechaza vencida", () => {
    const future = Date.now() + 30 * 86_400_000;
    const code = generateLicense(SECRET, { kind: "monthly", expiry: future });
    expect(verifyLicense(code, env)?.kind).toBe("monthly");
    const past = Date.now() - 1000;
    const expired = generateLicense(SECRET, { kind: "monthly", expiry: past });
    expect(verifyLicense(expired, env)).toBeNull();
  });

  it("verifyLicenseFor respeta el bot del payload", () => {
    const code = generateLicense(SECRET, { kind: "lifetime", bot: "mi-negocio" });
    expect(verifyLicenseFor(env, code, "mi-negocio")).toBe(true);
    expect(verifyLicenseFor(env, code, "otro-bot")).toBe(false);
  });
});
