import { describe, it, expect, vi, afterEach } from "vitest";
import { pushConfigured, vapidPublicKey, notifyOwnerPush } from "../src/push";
import type { Env } from "../src/env";

// Par VAPID de prueba (generado con node:crypto, no se usa en producción).
const PUB =
  "BIPciPvhsudphdY3Q2CTBswlUfXctcwZbaovuXh3_zmNROUddk78AMX7ZfRRSnW90iwOWAEf2_m4gIbZZDRJX10";
const PRIV = "o_Cn02DJTSPL8IaYCBiJqATZAeUuk82ab4Iuh4gTro4";

const baseEnv = {
  VAPID_PUBLIC_KEY: PUB,
  VAPID_PRIVATE_KEY: PRIV,
  VAPID_SUBJECT: "mailto:test@example.com",
} as unknown as Env;

afterEach(() => vi.restoreAllMocks());

describe("pushConfigured", () => {
  it("false si falta cualquiera de las 3", () => {
    expect(pushConfigured({} as Env)).toBe(false);
    expect(pushConfigured({ VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV } as Env)).toBe(false);
  });
  it("true con las 3", () => {
    expect(pushConfigured(baseEnv)).toBe(true);
    expect(vapidPublicKey(baseEnv)).toBe(PUB);
  });
});

describe("notifyOwnerPush", () => {
  it("no hace nada si no está configurado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await notifyOwnerPush({} as Env, { title: "x", body: "y" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encola el evento y manda un push por suscripción; el JWT lleva aud/sub y firma ES256", async () => {
    // D1 falso mínimo: registra los INSERT y devuelve 1 suscripción.
    const runs: { sql: string; params: unknown[] }[] = [];
    const db = {
      prepare: (sql: string) => {
        let bound: unknown[] = [];
        const stmt: any = {
          bind: (...a: unknown[]) => { bound = a; return stmt; },
          run: async () => { runs.push({ sql, params: bound }); return { meta: {} }; },
          all: async () =>
            sql.includes("FROM push_subscriptions")
              ? { results: [{ endpoint: "https://fcm.example.com/send/abc", p256dh: "x", auth: "y", created_at: 1, last_ok_at: null }] }
              : { results: [] },
          first: async () => null,
        };
        return stmt;
      },
    };
    const env = { ...baseEnv, DB: db } as unknown as Env;

    let sentUrl = "";
    let sentHeaders: Record<string, string> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        sentUrl = String(url);
        sentHeaders = init.headers as Record<string, string>;
        return new Response(null, { status: 201 });
      }),
    );

    await notifyOwnerPush(env, { title: "💰 Nuevo prospecto", body: "Kia usado", url: "/admin/leads" });

    expect(runs.some((r) => r.sql.includes("INSERT INTO push_events"))).toBe(true);
    expect(sentUrl).toBe("https://fcm.example.com/send/abc");
    expect(sentHeaders.Authorization).toMatch(/^vapid t=.+, k=/);

    // Verificar el JWT: 3 partes, claims correctos, firma válida con la pública.
    const jwt = sentHeaders.Authorization.match(/t=([^,]+)/)![1];
    const [h, p, sig] = jwt.split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims.aud).toBe("https://fcm.example.com");
    expect(claims.sub).toBe("mailto:test@example.com");
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const raw = Buffer.from(PUB, "base64url");
    const keyData = { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33, 65).toString("base64url") };
    const key = await crypto.subtle.importKey("jwk", keyData as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      Buffer.from(sig, "base64url"),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });

  it("borra la suscripción si el push devuelve 410", async () => {
    const runs: string[] = [];
    const db = {
      prepare: (sql: string) => {
        const stmt: any = {
          bind: () => stmt,
          run: async () => { runs.push(sql); return { meta: {} }; },
          all: async () =>
            sql.includes("FROM push_subscriptions")
              ? { results: [{ endpoint: "https://dead.example/x", p256dh: "x", auth: "y", created_at: 1, last_ok_at: null }] }
              : { results: [] },
          first: async () => null,
        };
        return stmt;
      },
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 410 })));
    await notifyOwnerPush({ ...baseEnv, DB: db } as unknown as Env, { title: "x", body: "y" });
    expect(runs.some((s) => s.includes("DELETE FROM push_subscriptions"))).toBe(true);
  });
});
