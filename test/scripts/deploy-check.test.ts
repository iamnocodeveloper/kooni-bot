import { describe, it, expect } from "vitest";
import { validateDeployConfig } from "../../scripts/deploy-check";

describe("validateDeployConfig", () => {
  const full = {
    ANTHROPIC_API_KEY: "sk-x",
    BOT_NAME: "Testi",
    BOT_TIER: "pro",
    DASHBOARD_PASSWORD: "pw",
    TELEGRAM_BOT_TOKEN: "tok",
  };

  it("passes with a complete Pro config", () => {
    expect(validateDeployConfig(full)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("passes a Free config without DASHBOARD_PASSWORD", () => {
    const { DASHBOARD_PASSWORD, ...rest } = full;
    expect(validateDeployConfig({ ...rest, BOT_TIER: "free" }).ok).toBe(true);
  });

  it("fails when ANTHROPIC_API_KEY is missing", () => {
    const { ANTHROPIC_API_KEY, ...rest } = full;
    const r = validateDeployConfig(rest);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("ANTHROPIC_API_KEY");
  });

  it("fails when no channel is configured", () => {
    const { TELEGRAM_BOT_TOKEN, ...rest } = full;
    const r = validateDeployConfig(rest);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("canal");
  });

  it("fails Pro without DASHBOARD_PASSWORD", () => {
    const { DASHBOARD_PASSWORD, ...rest } = full;
    const r = validateDeployConfig(rest);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("DASHBOARD_PASSWORD");
  });

  it("avisa con key de gateway sin OPENAI_API_BASE_URL", () => {
    const r = validateDeployConfig({
      ...full,
      OPENAI_API_KEY: "sk-ais3e1414870f2dd09453ef8e3769e7c3ef3ec7f42e27bfa61caa",
    });
    expect(r.ok).toBe(true); // es un aviso, no un bloqueo
    expect(r.warnings.join(" ")).toContain("OPENAI_API_BASE_URL");
  });

  it("no avisa con key directa de OpenAI (sk-proj-…)", () => {
    const r = validateDeployConfig({
      ...full,
      OPENAI_API_KEY: "sk-proj-abc123def456ghi789jkl012mno345pqr678stu",
    });
    expect(r.warnings.join(" ")).not.toContain("OPENAI_API_BASE_URL");
  });
});
