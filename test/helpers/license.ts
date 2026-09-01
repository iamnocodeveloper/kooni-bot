// Helper de licencias v2 para tests: par Ed25519 de prueba + D1 stub con settings.
import { generateKeyPairSync } from "node:crypto";
import { generateLicenseV2 } from "../../src/license";
import type { Env } from "../../src/env";
import type { D1Database } from "@cloudflare/workers-types";

export const testLicense = (() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return { priv, pub, code: generateLicenseV2(priv, { kind: "lifetime" }) };
})();

/** Código v2 firmado con la llave de prueba. */
export function proCode(payload: Record<string, unknown> = {}): string {
  return generateLicenseV2(testLicense.priv, { kind: "lifetime", ...payload } as never);
}

/** Stub D1 en memoria con la tabla settings. */
export function makeDb(settings: Record<string, string>): D1Database {
  const self = {
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/SELECT value FROM settings WHERE key = \?/.test(sql)) {
        const v = settings[params[0] as string];
        return (v !== undefined ? { value: v } : null) as T;
      }
      return null;
    },
    async all<T = unknown>(sql?: string): Promise<T[]> {
      if (sql && /FROM settings/.test(sql)) {
        return Object.entries(settings).map(([key, value]) => ({ key, value })) as T[];
      }
      return [] as T[];
    },
    async run(): Promise<{ meta: { changes: number } }> {
      return { meta: { changes: 0 } };
    },
  };
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            run: () => self.run(),
            first: () => self.first(sql, params),
            all: () => self.all(sql).then((rows) => ({ results: rows })),
          };
        },
      };
    },
  } as unknown as D1Database;
}

/** Env "Pro" con licencia v2 válida (settings.pro_license firmado). */
export function proEnv(extra: Partial<Env> = {}): Env {
  return {
    DB: makeDb({ pro_license: testLicense.code }) as never,
    LICENSE_PUBLIC_KEY: testLicense.pub,
    ...extra,
  } as unknown as Env;
}
