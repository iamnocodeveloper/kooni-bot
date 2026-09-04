import { describe, it, expect } from "vitest";
import { resolveWahaConfig } from "../../src/channels/wahaCredentials";
import type { Env } from "../../src/env";

describe("resolveWahaConfig", () => {
  it("sin DB, cae a las vars/secrets de env", async () => {
    const env = {
      WAHA_API_URL: "https://waha.example.com:3000/",
      WAHA_API_KEY: "envkey",
      WAHA_SESSION: "ventas",
      WAHA_WEBHOOK_TOKEN: "envtoken",
    } as unknown as Env;
    const cfg = await resolveWahaConfig(env);
    expect(cfg.base).toBe("https://waha.example.com:3000");
    expect(cfg.session).toBe("ventas");
    expect(cfg.apiKey).toBe("envkey");
    expect(cfg.webhookToken).toBe("envtoken");
  });

  it("sin nada configurado, sesión por defecto 'default' y el resto vacío", async () => {
    const cfg = await resolveWahaConfig({} as Env);
    expect(cfg.base).toBe("");
    expect(cfg.session).toBe("default");
    expect(cfg.apiKey).toBeUndefined();
    expect(cfg.webhookToken).toBeUndefined();
  });

  it("lo guardado en settings (D1) gana sobre env", async () => {
    const stored: Record<string, string> = {
      waha_api_url: "https://panel.example.com:3000",
      waha_session: "principal",
      waha_api_key: "panelkey",
      waha_webhook_token: "paneltoken",
    };
    const fakeDb = {
      prepare: () => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            const key = args[0] as string;
            return key in stored ? { value: stored[key] } : null;
          },
        }),
      }),
    };
    const env = {
      DB: fakeDb,
      WAHA_API_URL: "https://env.example.com:3000",
      WAHA_API_KEY: "envkey",
    } as unknown as Env;
    const cfg = await resolveWahaConfig(env);
    expect(cfg.base).toBe("https://panel.example.com:3000");
    expect(cfg.session).toBe("principal");
    expect(cfg.apiKey).toBe("panelkey");
    expect(cfg.webhookToken).toBe("paneltoken");
  });
});
