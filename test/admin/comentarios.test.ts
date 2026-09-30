/**
 * Tests del inbox de Comentarios (pestaña tipo inbox): render de dos paneles,
 * detalle con publicación + automatización, y acciones manuales (responder en
 * público / DM). Las llamadas a Zernio están mockeadas; D1 es real (miniflare).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  reply: vi.fn(async (): Promise<any> => ({ ok: true, status: 200 })),
  dm: vi.fn(async (): Promise<any> => ({ ok: true, status: 200 })),
  thread: vi.fn(async (): Promise<any> => ({ post: null, comments: [] })),
}));

vi.mock("../../src/channels/zernioComments", async (importActual) => {
  const actual = await importActual<any>();
  return {
    ...actual,
    replyToComment: mocks.reply,
    privateReplyToComment: mocks.dm,
    fetchCommentThread: mocks.thread,
  };
});

import { createTestMiniflare } from "../helpers/miniflareSetup";
import { adminApp } from "../../src/admin/routes";
import { Db } from "../../src/db/client";
import { CommentsRepo } from "../../src/db/comments";
import { CommentPostsRepo } from "../../src/db/commentPosts";
import { AutoRulesRepo } from "../../src/db/autoRules";
import type { Env } from "../../src/env";

const PASSWORD = "secret123";

function basicAuthHeader(user: string, pass: string): string {
  const raw = `${user}:${pass}`;
  const b64 = typeof btoa === "function" ? btoa(raw) : Buffer.from(raw, "utf-8").toString("base64");
  return `Basic ${b64}`;
}
const AUTH = { Authorization: basicAuthHeader("admin", PASSWORD) };
const FORM = { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" };

let env: Env;
let db: Db;
let comments: CommentsRepo;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = (await mf.getD1Database("DB")) as any;
  env = {
    DB: d1,
    BOT_NAME: "TestBot",
    BUSINESS_NAME: "Negocio de Prueba",
    BOT_LANGUAGE: "es",
    BOT_TIER: "pro",
    BUFFER_SECONDS: "8",
    DASHBOARD_PASSWORD: PASSWORD,
  } as unknown as Env;
  db = new Db(d1);
  comments = new CommentsRepo(db);
  mocks.reply.mockReset().mockResolvedValue({ ok: true, status: 200 });
  mocks.dm.mockReset().mockResolvedValue({ ok: true, status: 200 });
  mocks.thread.mockReset().mockResolvedValue({ post: null, comments: [] });
});

async function seedComment(over: Record<string, unknown> = {}) {
  const id = String(over.id ?? "cm_1");
  await comments.upsert({
    id,
    postId: "post_1",
    text: String(over.text ?? "¿cuánto cuesta?"),
    authorUsername: "maria.g",
    authorName: "María",
    platform: "instagram",
    accountId: "acc_1",
    ruleId: over.ruleId as string | undefined,
    publicReplySent: over.publicReplySent as boolean | undefined,
    dmSent: over.dmSent as boolean | undefined,
    createdAt: Number(over.createdAt ?? Date.now()),
  });
  return id;
}

describe("GET /admin/comentarios — inbox", () => {
  it("renderiza los dos paneles y los pills de filtro", async () => {
    await seedComment();
    const res = await adminApp.request("/admin/comentarios", { headers: AUTH }, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Comentarios");
    expect(html).toContain("Con regla");
    expect(html).toContain("Sin regla");
    expect(html).toContain('id="comment-list"');
    expect(html).toContain('id="comment-detail"');
  });

  it("con ?c= muestra el detalle: publicación y automatización", async () => {
    const id = await seedComment({ ruleId: "r1" });
    await new CommentPostsRepo(db).upsert({
      postId: "post_1",
      caption: "Nuevo modelo 2026",
      permalink: "https://instagram.com/p/abc",
      fetchedAt: Date.now(),
    });
    const rule = await new AutoRulesRepo(db).create({ kind: "comment_dm", keywords: ["precio"], message: "hola" });

    const res = await adminApp.request(`/admin/comentarios?c=${encodeURIComponent(id)}`, { headers: AUTH }, env);
    const html = await res.text();
    expect(html).toContain("Nuevo modelo 2026");
    expect(html).toContain("https://instagram.com/p/abc");
    expect(html).toContain(rule.id); // la regla que entró
    expect(html).toContain("Responder");
  });
});

describe("POST /admin/comentarios/:id/reply y /dm", () => {
  it("responde en público: llama a Zernio, marca el estado y audita", async () => {
    const id = await seedComment();
    const res = await adminApp.request(
      `/admin/comentarios/${encodeURIComponent(id)}/reply`,
      { method: "POST", headers: FORM, body: "text=¡Gracias por escribir!&" },
      env,
    );
    expect(res.status).toBe(200);
    expect(mocks.reply).toHaveBeenCalledTimes(1);
    expect((mocks.reply.mock.calls[0] as any)[1]).toMatchObject({
      postId: "post_1",
      commentId: id,
      message: "¡Gracias por escribir!",
    });
    const after = await comments.getById(id);
    expect(after?.publicReplySent).toBe(true);
    expect(after?.publicReplyText).toBe("¡Gracias por escribir!");

    const html = await res.text();
    expect(html).toContain("Respuesta pública enviada");
  });

  it("manda el DM y avisa cuando la private reply ya se usó", async () => {
    const id = await seedComment();
    mocks.dm.mockResolvedValueOnce({ ok: false, status: 400, consumed: true, error: "private reply already sent" });
    const res = await adminApp.request(
      `/admin/comentarios/${encodeURIComponent(id)}/dm`,
      { method: "POST", headers: FORM, body: "text=Te escribo por privado" },
      env,
    );
    const html = await res.text();
    expect(html).toContain("ya había usado la respuesta privada");
    const after = await comments.getById(id);
    expect(after?.dmSent).toBe(false);
  });

  it("exige texto para responder", async () => {
    const id = await seedComment();
    const res = await adminApp.request(
      `/admin/comentarios/${encodeURIComponent(id)}/reply`,
      { method: "POST", headers: FORM, body: "text=" },
      env,
    );
    expect(mocks.reply).not.toHaveBeenCalled();
    expect(await res.text()).toContain("Faltan datos");
  });
});
