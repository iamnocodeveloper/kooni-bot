import { describe, it, expect } from "vitest";
import {
  voiceOverridesFrom,
  vapiConfigured,
  retellConfigured,
  voiceConfigured,
  type VoiceConfig,
} from "../../src/integrations/voiceProviders";
import { SETTING_KEYS } from "../../src/db/settings";

describe("voiceProviders (cobros por voz — Vapi / Retell)", () => {
  it("voiceOverridesFrom lee todos los campos desde settings", () => {
    const o = voiceOverridesFrom({
      [SETTING_KEYS.voiceProvider]: "vapi",
      [SETTING_KEYS.vapiApiKey]: "sk_live_123",
      [SETTING_KEYS.vapiAssistantId]: "asst_1",
      [SETTING_KEYS.vapiPhoneNumberId]: "pn_1",
      [SETTING_KEYS.vapiWebhookSecret]: "whsec",
      [SETTING_KEYS.vapiApiBaseUrl]: "https://api.vapi.ai",
      [SETTING_KEYS.retellApiKey]: "key_1",
      [SETTING_KEYS.retellAgentId]: "agent_1",
      [SETTING_KEYS.retellPhoneNumber]: "+15610000000",
      [SETTING_KEYS.cobrosVoiceObjective]: "cobrar con respeto",
      [SETTING_KEYS.cobrosVoiceMaxAttempts]: "5",
    });
    expect(o.provider).toBe("vapi");
    expect(o.vapi.apiKey).toBe("sk_live_123");
    expect(o.vapi.assistantId).toBe("asst_1");
    expect(o.vapi.phoneNumberId).toBe("pn_1");
    expect(o.vapi.webhookSecret).toBe("whsec");
    expect(o.retell.apiKey).toBe("key_1");
    expect(o.retell.agentId).toBe("agent_1");
    expect(o.retell.phoneNumber).toBe("+15610000000");
    expect(o.objective).toBe("cobrar con respeto");
    expect(o.maxAttempts).toBe(5);
  });

  it("provider inválido cae a \"\" (ninguno) y base URLs tienen default", () => {
    const o = voiceOverridesFrom({ [SETTING_KEYS.voiceProvider]: "otro" });
    expect(o.provider).toBe("");
    expect(o.vapi.baseUrl).toBe("https://api.vapi.ai");
    expect(o.retell.baseUrl).toBe("https://api.retellai.com");
    expect(o.maxAttempts).toBe(3);
  });

  it("vapiConfigured exige apiKey + assistantId + phoneNumberId", () => {
    expect(vapiConfigured({ baseUrl: "https://api.vapi.ai" })).toBe(false);
    expect(vapiConfigured({ apiKey: "k", baseUrl: "x" })).toBe(false);
    expect(vapiConfigured({ apiKey: "k", assistantId: "a", baseUrl: "x" })).toBe(false);
    expect(vapiConfigured({ apiKey: "k", assistantId: "a", phoneNumberId: "p", baseUrl: "x" })).toBe(true);
  });

  it("retellConfigured exige apiKey + agentId", () => {
    expect(retellConfigured({ baseUrl: "https://api.retellai.com" })).toBe(false);
    expect(retellConfigured({ apiKey: "k", baseUrl: "x" })).toBe(false);
    expect(retellConfigured({ apiKey: "k", agentId: "a", baseUrl: "x" })).toBe(true);
  });

  it("voiceConfigured mira solo el proveedor activo", () => {
    const cfg: VoiceConfig = {
      provider: "vapi",
      vapi: { apiKey: "k", assistantId: "a", phoneNumberId: "p", baseUrl: "x" },
      retell: { baseUrl: "y" },
      objective: "",
      maxAttempts: 3,
    };
    expect(voiceConfigured(cfg)).toBe(true);
    expect(voiceConfigured({ ...cfg, provider: "retell" })).toBe(false);
    expect(voiceConfigured({ ...cfg, provider: "" })).toBe(false);
  });
});
