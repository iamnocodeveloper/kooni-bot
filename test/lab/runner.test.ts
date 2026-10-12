import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { LeadsRepo } from "../../src/db/leads";
import { buildTools } from "../../src/tools";

let env: any;
let db: Db;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  db = new Db(d1 as any);
  env = { DB: d1 };
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("buildTools en modo sandbox (Laboratorio)", () => {
  it("las tools de ACCIÓN devuelven un stub y NO escriben en D1", async () => {
    const tools = await buildTools({ env, getConversationId: () => null, sandbox: true });
    const out = (await tools.captureLead.execute!(
      { name: "Sim", intent: "prueba del lab" },
      {} as any,
    )) as any;
    expect(out.sandbox).toBe(true);
    expect(out.haria).toContain("captureLead");
    // Nada se persistió.
    expect(await new LeadsRepo(db).list(10)).toHaveLength(0);
  });

  it("las tools de LECTURA siguen reales en el sandbox", async () => {
    const tools = await buildTools({ env, getConversationId: () => null, sandbox: true });
    expect(typeof tools.searchKb.execute).toBe("function");
    expect(typeof tools.catalogQuery.execute).toBe("function");
  });

  it("sin sandbox, captureLead SÍ escribe (control)", async () => {
    const tools = await buildTools({ env, getConversationId: () => null });
    await tools.captureLead.execute!({ name: "Real", intent: "compra" }, {} as any);
    expect(await new LeadsRepo(db).list(10)).toHaveLength(1);
  });
});
