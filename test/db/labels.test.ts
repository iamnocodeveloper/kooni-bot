import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { LabelsRepo, slugifyLabel } from "../../src/db/labels";

let repo: LabelsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  repo = new LabelsRepo(new Db((await mf.getD1Database("DB")) as any));
});

describe("slugifyLabel", () => {
  it("normaliza acentos, espacios y símbolos", () => {
    expect(slugifyLabel("Pide factura")).toBe("pide_factura");
    expect(slugifyLabel("Mayorista / Distribuidor")).toBe("mayorista_distribuidor");
    expect(slugifyLabel("Cotización")).toBe("cotizacion");
  });

  it("cae a un id aleatorio si el nombre no deja caracteres", () => {
    expect(slugifyLabel("!!!").startsWith("l_")).toBe(true);
  });
});

describe("LabelsRepo", () => {
  it("crea (id = slug), lista y devuelve por id", async () => {
    const id = await repo.upsert({ name: "Pide factura", color: "var(--accent)" });
    expect(id).toBe("pide_factura");
    const list = await repo.list();
    expect(list.map((l) => l.id)).toContain("pide_factura");
    const row = await repo.get("pide_factura");
    expect(row?.name).toBe("Pide factura");
    expect(row?.color).toBe("var(--accent)");
    expect(row?.enabled).toBe(1);
  });

  it("actualiza una existente sin duplicar", async () => {
    const id = await repo.upsert({ name: "Vip" });
    await repo.upsert({ id, name: "VIP", color: "var(--ok)" });
    const list = await repo.list();
    expect(list.filter((l) => l.id === id)).toHaveLength(1);
    expect((await repo.get(id))?.name).toBe("VIP");
  });

  it("toggle y delete (borra también reglas y asignaciones)", async () => {
    const id = await repo.upsert({ name: "Spam" });
    await repo.upsertRule({ labelId: id, kind: "keyword", keywords: ["gratis"] });
    await repo.setEnabled(id, false);
    expect((await repo.get(id))?.enabled).toBe(0);
    await repo.remove(id);
    expect(await repo.get(id)).toBeNull();
    expect(await repo.listRules(id)).toHaveLength(0);
  });

  it("reglas: crea keyword y IA, lista y filtra habilitadas", async () => {
    const id = await repo.upsert({ name: "Interesado" });
    await repo.upsertRule({ labelId: id, kind: "keyword", keywords: ["precio", "cuánto"] });
    await repo.upsertRule({ labelId: id, kind: "ai", aiInstruction: "el cliente muestra intención real de compra" });
    expect(await repo.listRules(id)).toHaveLength(2);
    expect(await repo.enabledRules("keyword")).toHaveLength(1);
    const kw = (await repo.enabledRules("keyword"))[0];
    expect(LabelsRepo.keywordsOf(kw)).toEqual(["precio", "cuánto"]);
  });
});
