import { describe, it, expect, vi, afterEach } from "vitest";
import {
  extractPostContext,
  fetchCommentThread,
  replyToComment,
  privateReplyToComment,
} from "../../src/channels/zernioComments";

const env = { ZERNIO_API_KEY: "k-test" } as any;

afterEach(() => vi.restoreAllMocks());

describe("extractPostContext", () => {
  it("mapea caption/permalink de variantes del payload", () => {
    expect(extractPostContext({ id: "p1", content: "Hola", permalink: "https://x/p1" })).toEqual({
      postId: "p1",
      platformPostId: undefined,
      platform: undefined,
      caption: "Hola",
      permalink: "https://x/p1",
      picture: undefined,
    });
    // variantes
    const alt = extractPostContext({ id: "p2", title: "T", url: "https://x/p2" });
    expect(alt?.caption).toBe("T");
    expect(alt?.permalink).toBe("https://x/p2");
  });

  it("usa el postId de respaldo y devuelve null sin id", () => {
    expect(extractPostContext({ caption: "solo caption" }, "fallback")?.postId).toBe("fallback");
    expect(extractPostContext(null)).toBeNull();
    expect(extractPostContext({})).toBeNull();
  });
});

describe("replyToComment", () => {
  it("hace POST público con Idempotency-Key y el body correcto", async () => {
    const fn = vi.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fn as any;
    const res = await replyToComment(env, { accountId: "acc", postId: "post_1", commentId: "cm_1", message: "gracias!" });
    expect(res).toEqual({ ok: true, status: 200 });
    const [url, init] = fn.mock.calls[0] as any;
    expect(url).toBe("https://zernio.com/api/v1/inbox/comments/post_1");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("post_1:cm_1:public");
    expect(JSON.parse(init.body)).toEqual({ accountId: "acc", message: "gracias!", commentId: "cm_1" });
  });

  it("devuelve error legible cuando falla", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 400 })) as any;
    const res = await replyToComment(env, { accountId: "acc", postId: "p", commentId: "c", message: "x" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toContain("nope");
  });
});

describe("privateReplyToComment", () => {
  it("hace POST al endpoint private-reply", async () => {
    const fn = vi.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fn as any;
    const res = await privateReplyToComment(env, { accountId: "acc", postId: "p", commentId: "c", message: "hola" });
    expect(res.ok).toBe(true);
    const [url] = fn.mock.calls[0] as any;
    expect(url).toBe("https://zernio.com/api/v1/inbox/comments/p/c/private-reply");
  });

  it("marca consumed cuando Meta ya usó la respuesta privada", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "private reply already sent", details: { privateReplyConsumed: true } }), {
          status: 400,
        }),
    ) as any;
    const res = await privateReplyToComment(env, { accountId: "acc", postId: "p", commentId: "c", message: "hola" });
    expect(res.ok).toBe(false);
    expect(res.consumed).toBe(true);
  });
});

describe("fetchCommentThread", () => {
  it("mapea el post y los comentarios (incluye nuestras respuestas)", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            post: { id: "p1", content: "Nuevo modelo", permalink: "https://x/p1" },
            comments: [
              { id: "cm_1", message: "precio?", from: { username: "maria", name: "María" } },
              { id: "cm_2", message: "te escribo", from: { id: "me", isOwner: true } },
            ],
          }),
          { status: 200 },
        ),
    ) as any;
    const t = await fetchCommentThread(env, { accountId: "acc", postId: "p1", commentId: "cm_1" });
    expect(t.post?.caption).toBe("Nuevo modelo");
    expect(t.comments).toHaveLength(2);
    expect(t.comments[0].author.username).toBe("maria");
    expect(t.comments[1].author.isOwner).toBe(true);
  });

  it("sin api key no llama a la red y devuelve vacío", async () => {
    const fn = vi.fn();
    globalThis.fetch = fn as any;
    const t = await fetchCommentThread({} as any, { postId: "p1" });
    expect(t).toEqual({ post: null, comments: [] });
    expect(fn).not.toHaveBeenCalled();
  });
});
