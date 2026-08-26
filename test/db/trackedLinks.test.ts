import { describe, it, expect } from "vitest";
import { TrackedLinksRepo } from "../../src/db/trackedLinks";

// Stub de Db en memoria (run/first/all) — mismo patrón que autoRules.test.ts.
function makeDb() {
  const links: any[] = [];
  const clicks: any[] = [];
  const db = {
    async run(sql: string, params: unknown[] = []) {
      if (/INSERT INTO auto_rule_links/.test(sql)) {
        links.push({
          id: params[0],
          rule_id: params[1],
          slug: params[2],
          destination_url: params[3],
          label: params[4],
          created_at: params[5],
        });
        return {};
      }
      if (/DELETE FROM auto_rule_links/.test(sql)) {
        links.splice(
          links.findIndex((r) => r.rule_id === params[0]),
          1,
        );
        return {};
      }
      if (/INSERT INTO auto_rule_clicks/.test(sql)) {
        clicks.push({ id: params[0], slug: params[1], ip_hash: params[2], clicked_at: params[3] });
        return {};
      }
      return {};
    },
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/FROM auto_rule_links/.test(sql) && sql.includes("slug = ?")) {
        const row = links.find((l) => l.slug === params[0]);
        return (row ?? null) as T | null;
      }
      if (/COUNT\(\*\) as n FROM auto_rule_clicks/.test(sql)) {
        const n = clicks.filter((c) => c.slug === params[0]).length;
        return { n } as T;
      }
      return null;
    },
    async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (/FROM auto_rule_links/.test(sql) && sql.includes("rule_id = ?")) {
        return links.filter((l) => l.rule_id === params[0]) as T[];
      }
      return [] as T[];
    },
  };
  return db;
}

describe("TrackedLinksRepo", () => {
  it("crea un link con slug único y lo lee por slug", async () => {
    const repo = new TrackedLinksRepo(makeDb() as any);
    const link = await repo.ensureForRule("rule-1", "https://tusitio.com/catalogo", "Ver catálogo");
    expect(link.slug).toBeTruthy();
    expect(link.slug.length).toBeGreaterThanOrEqual(8);
    expect(link.destinationUrl).toBe("https://tusitio.com/catalogo");
    expect(link.label).toBe("Ver catálogo");

    const got = await repo.getBySlug(link.slug);
    expect(got?.ruleId).toBe("rule-1");
  });

  it("no duplica links para la misma regla+url", async () => {
    const repo = new TrackedLinksRepo(makeDb() as any);
    await repo.ensureForRule("rule-1", "https://x.com/a");
    await repo.ensureForRule("rule-1", "https://x.com/a");
    const links = await repo.listByRule("rule-1");
    expect(links.length).toBe(1);
  });

  it("registra clicks y los cuenta", async () => {
    const db = makeDb();
    const repo = new TrackedLinksRepo(db as any);
    const link = await repo.ensureForRule("rule-1", "https://x.com/a");
    expect(await repo.registerClick(link.slug, "hash1")).toBe("https://x.com/a");
    expect(await repo.registerClick(link.slug, "hash2")).toBe("https://x.com/a");
    expect(await repo.clickCount(link.slug)).toBe(2);
  });

  it("devuelve null en registerClick si el slug no existe", async () => {
    const repo = new TrackedLinksRepo(makeDb() as any);
    expect(await repo.registerClick("no-existe", null)).toBeNull();
  });
});
