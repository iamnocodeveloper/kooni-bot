import { describe, it, expect } from "vitest";
import { CommentPostsRepo, POST_CONTEXT_TTL_MS } from "../../src/db/commentPosts";

// Stub de Db en memoria con semántica de UPSERT por post_id.
function makeDb() {
  const rows: any[] = [];
  return {
    async run(sql: string, params: unknown[] = []) {
      if (/INSERT INTO comment_posts/.test(sql)) {
        const existing = rows.find((r) => r.post_id === params[0]);
        const next = {
          post_id: params[0],
          platform_post_id: params[1],
          platform: params[2],
          account_id: params[3],
          caption: params[4],
          permalink: params[5],
          picture: params[6],
          fetched_at: params[7],
        };
        if (existing) {
          // COALESCE: no pisa un dato bueno con null.
          for (const k of ["platform_post_id", "platform", "account_id", "caption", "permalink", "picture"] as const) {
            if (next[k] != null) existing[k] = next[k];
          }
          existing.fetched_at = next.fetched_at;
        } else {
          rows.push(next);
        }
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
    async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (/FROM comment_posts WHERE post_id/.test(sql)) {
        return (rows.find((r) => r.post_id === params[0]) as T) ?? null;
      }
      return null;
    },
    async all<T = unknown>(): Promise<T[]> {
      return rows as T[];
    },
  };
}

describe("CommentPostsRepo", () => {
  it("guarda y lee el contexto de la publicación", async () => {
    const repo = new CommentPostsRepo(makeDb() as any);
    await repo.upsert({
      postId: "post_1",
      platform: "instagram",
      caption: "¡Llegó el nuevo modelo!",
      permalink: "https://instagram.com/p/abc",
      fetchedAt: 1000,
    });
    const post = await repo.get("post_1");
    expect(post?.caption).toBe("¡Llegó el nuevo modelo!");
    expect(post?.permalink).toBe("https://instagram.com/p/abc");
    expect(await repo.get("nope")).toBeNull();
  });

  it("el upsert no pisa datos buenos con null", async () => {
    const repo = new CommentPostsRepo(makeDb() as any);
    await repo.upsert({ postId: "p", caption: "original", permalink: "https://x", fetchedAt: 1 });
    await repo.upsert({ postId: "p", platform: "facebook", fetchedAt: 2 });
    const post = await repo.get("p");
    expect(post?.caption).toBe("original");
    expect(post?.permalink).toBe("https://x");
    expect(post?.platform).toBe("facebook");
  });

  it("isFresh respeta el TTL", async () => {
    const repo = new CommentPostsRepo(makeDb() as any);
    await repo.upsert({ postId: "fresh", caption: "x", fetchedAt: Date.now() });
    expect(await repo.isFresh("fresh")).toBe(true);
    await repo.upsert({ postId: "old", caption: "x", fetchedAt: Date.now() - POST_CONTEXT_TTL_MS - 1000 });
    expect(await repo.isFresh("old")).toBe(false);
  });
});
