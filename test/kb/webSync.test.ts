import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { SettingsRepo, SETTING_KEYS } from "../../src/db/settings";
import { KbDocsRepo } from "../../src/kb/docs";
import { parseWebSyncUrls, webDocId, runWebSync, trimBoilerplate } from "../../src/kb/webSync";
import type { Env } from "../../src/env";

describe("parseWebSyncUrls / webDocId", () => {
  it("acepta URLs por línea o coma, ignora basura, tope 10", () => {
    const urls = parseWebSyncUrls("https://a.com/1\nhttps://b.com/2, no-url ,https://c.com/3");
    expect(urls).toEqual(["https://a.com/1", "https://b.com/2", "https://c.com/3"]);
  });
  it("webDocId es estable, corto y namespaceado", () => {
    const id = webDocId("https://x.com/llm/inventory/?type=used&limit=100");
    expect(id.startsWith("web:")).toBe(true);
    expect(webDocId("https://x.com/llm/inventory/?limit=100&type=used")).toBe(id); // orden de query no importa
  });

  it("trimBoilerplate recorta nav y footer, deja el inventario", () => {
    const raw =
      "- [Home](/)\n- [New](/new)\n- [Used](/used)\n".repeat(30) +
      "### 2022 Kia Sorento\nUsed 34,000 miles $27,900\nVIN: KNDPU3DG4V7430723\n".repeat(40) +
      "\n## Contact Us\n561-555-1234\n" +
      "Your Privacy & Cookies — bla bla\n".repeat(10);
    const out = trimBoilerplate(raw);
    expect(out).toContain("Kia Sorento");
    expect(out).toContain("VIN: KNDPU3DG4V7430723");
    expect(out).not.toContain("[Home](/)");
    expect(out).not.toContain("Contact Us");
    expect(out.length).toBeLessThan(raw.length);
  });

  it("trimBoilerplate no rompe texto sin marcadores", () => {
    const plain = "Este es un texto corto sin precios ni menús.";
    expect(trimBoilerplate(plain)).toBe(plain);
  });

  it("webDocId nunca genera vectores > 64 bytes (Vectorize los rechaza)", () => {
    const largo =
      "https://www.greenwaykiawestpalmbeach.com/llm/inventory/?limit=100&type=used&bodytype=Cars&page=2&sort=price";
    const id = webDocId(largo);
    // indexDoc genera `dash:<id>#<n>` con n hasta 24 → el peor caso:
    const peor = `dash:${id}#24`;
    expect(Buffer.byteLength(peor, "utf8")).toBeLessThanOrEqual(64);
  });
});

describe("runWebSync", () => {
  let env: Env;
  let db: Db;
  let kbUpsert: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mf = await createTestMiniflare();
    const d1 = (await mf.getD1Database("DB")) as any;
    db = new Db(d1);
    kbUpsert = vi.fn(async () => ({}));
    env = {
      DB: d1,
      DECODO_AUTH: "user:pass",
      KB: { upsert: kbUpsert, deleteByIds: vi.fn(async () => ({})) },
      AI: { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) },
    } as unknown as Env;
    // Desbloquear el módulo por override del dueño.
    await new SettingsRepo(db).set(SETTING_KEYS.moduleUnlocks, JSON.stringify(["web_sync"]));
  });

  it("omite si el módulo está bloqueado", async () => {
    await new SettingsRepo(db).set(SETTING_KEYS.moduleUnlocks, "[]");
    const r = await runWebSync(env);
    expect(r.skipped).toContain("web_sync");
  });

  it("omite si falta DECODO_AUTH", async () => {
    const r = await runWebSync({ ...env, DECODO_AUTH: undefined } as Env);
    expect(r.skipped).toContain("DECODO_AUTH");
  });

  it("omite sin URLs configuradas", async () => {
    const r = await runWebSync(env);
    expect(r.skipped).toContain("URLs");
  });

  it("scrapea, guarda como doc web: e indexa; en la 2ª corrida sin cambios no re-indexa", async () => {
    await new SettingsRepo(db).set(SETTING_KEYS.webSyncUrls, "https://x.com/llm/inventory/?type=used");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [{ content: "# Inventario\nKia Rio 2020 $12000", status_code: 200 }] }), { status: 200 })),
    );

    const r1 = await runWebSync(env);
    expect(r1.updated).toBe(1);
    expect(kbUpsert).toHaveBeenCalled();

    const doc = await new KbDocsRepo(db).getById(webDocId("https://x.com/llm/inventory/?type=used"));
    expect(doc?.content).toContain("Kia Rio 2020");

    const r2 = await runWebSync(env);
    expect(r2.unchanged).toBe(1);
    expect(r2.updated).toBe(0);
  });

  it("registra el error y sigue si Decodo falla", async () => {
    await new SettingsRepo(db).set(SETTING_KEYS.webSyncUrls, "https://x.com/a");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const r = await runWebSync(env);
    expect(r.errors).toHaveLength(1);
    expect(r.updated).toBe(0);
  });
});
