import { describe, it, expect, vi, afterEach } from "vitest";
import { AutoRulesRepo } from "../../src/db/autoRules";

// In-memory stub del Db (la clase envuelve D1Database con run/first/all).
function makeDb() {
  const rows: any[] = [];
  const db = {
    async run(sql: string, params: unknown[] = []) {
      if (/^INSERT INTO auto_rules/.test(sql)) {
        rows.push({
          id: params[0],
          kind: params[1],
          platform: params[2],
          keywords: params[3],
          message: params[4],
          button_label: params[5],
          button_url: params[6],
          reply_to_comment: params[7],
          // is_active va hardcodeado como 1 en el INSERT (no es un ?)
          is_active: 1,
          created_at: params[8],
          updated_at: params[9],
        });
        return {};
      }
      if (/^UPDATE auto_rules/.test(sql)) {
        const row = rows.find((r) => r.id === params[params.length - 1]);
        if (row) {
          row.kind = params[0];
          row.platform = params[1];
          row.keywords = params[2];
          row.message = params[3];
          row.button_label = params[4];
          row.button_url = params[5];
          row.reply_to_comment = params[6];
          row.is_active = params[7];
          row.updated_at = params[8];
        }
        return {};
      }
      if (/^DELETE FROM auto_rules/.test(sql)) {
        rows.splice(
          rows.findIndex((r) => r.id === params[0]),
          1,
        );
        return {};
      }
      return {};
    },
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      const row = rows.find((r) => r.id === params[0]);
      return (row ?? null) as T | null;
    },
    async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
      let out = rows as any[];
      // Filtro mínimo para los tests del repo (WHERE kind = ? / is_active = 1)
      const kindIdx = sql.indexOf("kind = ?");
      if (kindIdx >= 0) {
        const kind = params[0] as string;
        out = out.filter((r) => r.kind === kind);
      }
      if (sql.includes("is_active = 1")) {
        out = out.filter((r) => r.is_active === 1);
      }
      return out as T[];
    },
  };
  return db;
}

function makeRepo() {
  return { repo: new AutoRulesRepo(makeDb() as any) };
}

afterEach(() => vi.restoreAllMocks());

describe("AutoRulesRepo", () => {
  it("crea una regla y la lee con keywords parseadas", async () => {
    const { repo } = makeRepo();
    const rule = await repo.create({
      kind: "comment_dm",
      platform: "instagram",
      keywords: ["precio", "cuánto cuesta"],
      message: "Te mando el catálogo 👇",
      buttonLabel: "Ver catálogo",
      buttonUrl: "https://kooni.app/catalogo",
      replyToComment: "¡Gracias por preguntar!",
    });
    expect(rule.id).toBeTruthy();
    expect(rule.keywords).toEqual(["precio", "cuánto cuesta"]);
    expect(rule.message).toBe("Te mando el catálogo 👇");
    expect(rule.isActive).toBe(true);

    const got = await repo.get(rule.id);
    expect(got?.buttonLabel).toBe("Ver catálogo");
    expect(got?.replyToComment).toBe("¡Gracias por preguntar!");
  });

  it("lista solo reglas activas del kind pedido", async () => {
    const { repo } = makeRepo();
    await repo.create({ kind: "dm_reply", keywords: ["hola"], message: "¡Hola!" });
    await repo.create({ kind: "comment_dm", keywords: ["precio"], message: "Catálogo" });
    const inactive = await repo.create({ kind: "dm_reply", keywords: ["chao"], message: "Adiós" });
    await repo.setActive(inactive.id, false);

    const active = await repo.list({ kind: "dm_reply", onlyActive: true });
    expect(active.length).toBe(1);
    expect(active[0].message).toBe("¡Hola!");
  });

  it("actualiza y elimina reglas", async () => {
    const { repo } = makeRepo();
    const rule = await repo.create({ kind: "comment_reply", keywords: ["cita"], message: "Claro" });
    const updated = await repo.update(rule.id, { message: "Claro, ¿qué día te queda bien?", isActive: false });
    expect(updated?.message).toBe("Claro, ¿qué día te queda bien?");
    expect(updated?.isActive).toBe(false);

    await repo.remove(rule.id);
    expect(await repo.get(rule.id)).toBeNull();
  });
});
