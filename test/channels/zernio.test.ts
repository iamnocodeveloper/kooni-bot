import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { zernioAdapter, parseZernioEvents, verifyZernioSignature, __resetZernioAccountsCache } from "../../src/channels/zernio";
import type { Env } from "../../src/env";

beforeEach(() => __resetZernioAccountsCache());

// Payloads espejo de la API pública de Zernio (github.com/zernio-dev/chat-sdk-adapter).
const dmPayload = {
  id: "evt_1",
  event: "message.received",
  timestamp: "2026-08-23T00:00:00Z",
  message: {
    id: "m_1",
    conversationId: "conv_1",
    platform: "instagram",
    direction: "incoming",
    text: "hola, quiero información",
    sender: { id: "usr_1", name: "María", username: "maria.g" },
    sentAt: "2026-08-23T00:00:00Z",
  },
  conversation: { id: "conv_1", participantName: "María", participantUsername: "maria.g" },
  account: { id: "acct_1", accountId: "acct_1", platform: "instagram", username: "mi_negocio" },
};

const commentPayload = {
  id: "evt_2",
  event: "comment.received",
  timestamp: "2026-08-23T00:00:00Z",
  comment: { id: "cm_1", postId: "post_1", platformPostId: "pp_1", text: "Claude por favor" },
  account: { id: "acct_1", accountId: "acct_1", platform: "instagram", username: "mi_negocio" },
};

const envBase = {
  ZERNIO_API_KEY: "zkey_test",
  ZERNIO_WEBHOOK_SECRET: "s3cret",
  ZERNIO_AUTO_DM_KEYWORD: "claude",
  ZERNIO_AUTO_DM_MESSAGE: "Aquí tienes el recurso 👇",
  ZERNIO_AUTO_DM_BUTTON_LABEL: "Abrir recurso",
  ZERNIO_AUTO_DM_BUTTON_URL: "https://kooni.app/recurso",
} as unknown as Env;

afterEach(() => vi.restoreAllMocks());

describe("verifyZernioSignature", () => {
  it("valida una firma HMAC-SHA256 correcta", async () => {
    // HMAC-SHA256("s3cret", body) en hex — generado con la misma función.
    const body = JSON.stringify(dmPayload);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("s3cret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await verifyZernioSignature(body, hex, "s3cret")).toBe(true);
  });

  it("rechaza firma inválida y ausente", async () => {
    const body = JSON.stringify(dmPayload);
    expect(await verifyZernioSignature(body, "deadbeef", "s3cret")).toBe(false);
    expect(await verifyZernioSignature(body, undefined, "s3cret")).toBe(false);
  });
});

describe("parseZernioEvents (message.received)", () => {
  it("convierte un DM entrante en mensaje del agente", async () => {
    const [msg] = await parseZernioEvents(dmPayload, envBase);
    expect(msg.channel).toBe("zernio");
    expect(msg.channelUserId).toBe("acct_1:conv_1"); // accountId:conversationId para enviar después
    expect(msg.displayName).toBe("María");
    expect(msg.text).toBe("hola, quiero información");
  });

  it("ignora mensajes salientes (echo)", async () => {
    const out = await parseZernioEvents(
      { ...dmPayload, message: { ...dmPayload.message, direction: "outgoing" } },
      envBase,
    );
    expect(out).toHaveLength(0);
  });
});

describe("auto-DM por keyword en comentarios", () => {
  it("manda DM privado (private-reply) con mensaje y botón cuando el comentario trae la keyword", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await parseZernioEvents(commentPayload, envBase);
    // El comentario no entra al agente:
    expect(out).toHaveLength(0);
    // accounts (resolución) + private-reply:
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://zernio.com/api/v1/inbox/comments/post_1/cm_1/private-reply");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer zkey_test");
    const body = JSON.parse(init.body as string);
    expect(body.accountId).toBe("acct_1");
    expect(body.message).toBe("Aquí tienes el recurso 👇");
    expect(body.buttons).toEqual([{ type: "url", title: "Abrir recurso", url: "https://kooni.app/recurso" }]);
  });

  it("NO manda DM si la keyword no aparece", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await parseZernioEvents(
      { ...commentPayload, comment: { ...commentPayload.comment, text: "me interesa" } },
      envBase,
    );
    expect(out).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no hace nada sin ZERNIO_AUTO_DM_KEYWORD", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const envNoKw = { ...envBase, ZERNIO_AUTO_DM_KEYWORD: undefined } as unknown as Env;
    await parseZernioEvents(commentPayload, envNoKw);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("soporta VARIAS reglas con varios mensajes (ZERNIO_AUTO_DM_RULES) y responde también en público", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const envRules = {
      ...envBase,
      ZERNIO_AUTO_DM_KEYWORD: undefined,
      ZERNIO_AUTO_DM_RULES: JSON.stringify([
        {
          keywords: ["precio", "cuánto cuesta"],
          message: "Te mando el catálogo 👇",
          buttonLabel: "Ver catálogo",
          buttonUrl: "https://kooni.app/catalogo",
          replyToComment: "¡Gracias por preguntar! Te escribí por privado ✨",
        },
        { keywords: ["claude"], message: "Aquí tienes el recurso" },
      ]),
    } as unknown as Env;

    const out = await parseZernioEvents(
      { ...commentPayload, comment: { ...commentPayload.comment, text: "¿cuánto cuesta el diseño?" } },
      envRules,
    );
    expect(out).toHaveLength(0);
    // accounts + DM privado + respuesta pública:
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [dmUrl, dmInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(dmUrl).toBe("https://zernio.com/api/v1/inbox/comments/post_1/cm_1/private-reply");
    expect(JSON.parse(dmInit.body as string).message).toBe("Te mando el catálogo 👇");
    expect(JSON.parse(dmInit.body as string).buttons).toEqual([{ type: "url", title: "Ver catálogo", url: "https://kooni.app/catalogo" }]);
    const [pubUrl, pubInit] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(pubUrl).toBe("https://zernio.com/api/v1/inbox/comments/post_1");
    const pubBody = JSON.parse(pubInit.body as string);
    expect(pubBody.message).toBe("¡Gracias por preguntar! Te escribí por privado ✨");
    expect(pubBody.commentId).toBe("cm_1");
  });

  it("elige la regla correcta según la keyword del comentario", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const envRules = {
      ...envBase,
      ZERNIO_AUTO_DM_KEYWORD: undefined,
      ZERNIO_AUTO_DM_RULES: JSON.stringify([
        { keywords: ["precio"], message: "Catálogo de precios" },
        { keywords: ["claude"], message: "Aquí tienes el recurso" },
      ]),
    } as unknown as Env;

    await parseZernioEvents(
      { ...commentPayload, comment: { ...commentPayload.comment, text: "me interesa el precio" } },
      envRules,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const call = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.message).toBe("Catálogo de precios");
  });

  it("usa el account social del inbox (no el id del webhook) al enviar private-reply", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "inbox_acct_99", platform: "instagram", username: "mi_negocio" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await parseZernioEvents(commentPayload, envBase);
    const dm = fetchMock.mock.calls.find((c) => String((c as [string])[0]).includes("/private-reply"));
    expect(dm).toBeTruthy();
    const body = JSON.parse(((dm as unknown as [string, RequestInit])[1]).body as string);
    // El webhook trae account.id=acct_1, pero el id social real es inbox_acct_99.
    expect(body.accountId).toBe("inbox_acct_99");
  });

});

describe("zernioAdapter.sendReply", () => {
  it("envía los chunks a la conversación correcta", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await zernioAdapter.sendReply(
      { channel: "zernio", channelUserId: "acct_1:conv_1", chunks: ["Hola", "¿Te ayudo?"], interChunkDelayMs: 0 },
      envBase,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/inbox/conversations/conv_1/messages");
    const body = JSON.parse(init.body as string);
    expect(body.accountId).toBe("acct_1");
    expect(body.message).toBe("Hola");
  });

  it("lanza error sin ZERNIO_API_KEY", async () => {
    await expect(
      zernioAdapter.sendReply(
        { channel: "zernio", channelUserId: "acct_1:conv_1", chunks: ["x"] },
        {} as Env,
      ),
    ).rejects.toThrow("ZERNIO_API_KEY");
  });
});

describe("follow gate (require_follow)", () => {
  // Stub mínimo de Db en memoria para AutoRulesRepo + DmLogsRepo.
  function makeDbStub(rule: any) {
    const processed: any[] = [];
    const logs: any[] = [];
    const rates: any[] = [];
    const self = {
      async run(sql: string, params: unknown[] = []) {
        if (/INSERT INTO processed_comments/.test(sql)) {
          processed.push({ comment_id: params[0], status: params[2] });
          return { meta: { changes: 1 } };
        }
        if (/INSERT INTO dm_logs/.test(sql)) {
          logs.push({ id: params[0], status: params[7] });
          return { meta: { changes: 1 } };
        }
        if (/UPDATE dm_rate_limits/.test(sql)) {
          const [accountId, windowStart, max] = params as [string, number, number];
          const row = rates.find((r) => r.account_id === accountId && r.window_start === windowStart);
          if (row && row.count < max) { row.count += 1; return { meta: { changes: 1 } }; }
          return { meta: { changes: 0 } };
        }
        if (/INSERT INTO dm_rate_limits/.test(sql)) {
          const [accountId, windowStart] = params as [string, number];
          if (!rates.some((r) => r.account_id === accountId && r.window_start === windowStart)) {
            rates.push({ account_id: accountId, window_start: windowStart, count: 1 });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        return { meta: { changes: 0 } };
      },
      async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
        if (/COUNT\(\*\) as n FROM processed_comments/.test(sql)) {
          const n = processed.filter((p) => p.comment_id === params[0] && p.status === "sent").length;
          return { n } as T;
        }
        if (/SELECT count FROM dm_rate_limits/.test(sql)) {
          const row = rates.find((r) => r.account_id === params[0] && r.window_start === params[1]);
          return { count: row?.count ?? 0 } as T;
        }
        if (/SELECT \* FROM auto_rules WHERE id = \?/.test(sql)) {
          return rule as T;
        }
        return null;
      },
      async all<T = unknown>(_sql: string, _params: unknown[] = []): Promise<T[]> {
        return (rule && rule.id ? [rule] : []) as T[];
      },
    };
    // Objeto D1 compatible: prepare() devuelve la cadena bind→run/first/all.
    // Db.all hace `res.results` — el stub debe devolver { results: [...] }.
    return {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]) {
            return {
              run: () => self.run(sql, params),
              first: () => self.first(sql, params),
              all: () => self.all(sql, params).then((rows) => ({ results: rows })),
            };
          },
        };
      },
    } as unknown as D1Database;
  }

  const fgRule = {
    id: "rule-fg",
    kind: "comment_dm",
    platform: "instagram",
    keywords: JSON.stringify(["link"]),
    message: "Aquí tienes el link:",
    button_label: "Abrir",
    button_url: "https://kooni.app/rec",
    reply_to_comment: null,
    is_active: 1,
    whole_word_match: 1,
    require_follow: 1,
    follow_prompt_message: "Hola {username}! Sígueme 👇",
    follow_button_label: "Ya te sigo",
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  it("si NO sigue: envía DM de follow gate con botón postback (no el link)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [{ _id: "acct_1", platform: "instagram" }] }), { status: 200 });
      }
      if (String(url).includes("/follow-status/")) {
        return new Response(JSON.stringify({ isFollower: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    const out = await parseZernioEvents(
      {
        event: "comment.received",
        comment: { id: "cm_9", postId: "post_1", platformPostId: "pp_1", text: "me interesa el link", author: { id: "usr_9", username: "pepe" } },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    expect(out).toHaveLength(0);
    // accounts + follow-status + private-reply (con botón postback)
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.length).toBe(3);
    const dmCall = calls[2];
    expect(String(dmCall[0])).toContain("/private-reply");
    const body = JSON.parse(dmCall[1].body as string);
    expect(body.message).toContain("Sígueme");
    expect(body.buttons[0].type).toBe("postback");
    expect(body.buttons[0].payload).toContain("followcheck:rule-fg");
  });

  it("si YA sigue: envía el link directamente", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/follow-status/")) {
        return new Response(JSON.stringify({ isFollower: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    await parseZernioEvents(
      {
        event: "comment.received",
        comment: { id: "cm_10", postId: "post_1", platformPostId: "pp_1", text: "me interesa el link", author: { id: "usr_10", username: "pepe" } },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const dmCall = calls.find((c) => String(c[0]).includes("/private-reply"));
    expect(dmCall).toBeTruthy();
    const body = JSON.parse((dmCall![1] as RequestInit).body as string);
    expect(body.message).toBe("Aquí tienes el link:");
    expect(body.buttons[0].type).toBe("url");
  });

  it("postback followcheck: verifica follow y entrega el link", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/follow-status/")) {
        return new Response(JSON.stringify({ isFollower: true }), { status: 200 });
      }
      if (String(url).includes("/conversations/")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      ZERNIO_API_KEY: "zkey_test",
      DB: makeDbStub(fgRule),
      DASHBOARD_BASE_URL: "https://kooni.app",
    } as unknown as Env;

    const out = await parseZernioEvents(
      {
        event: "message.received",
        message: { id: "m_1", conversationId: "conv_1", direction: "incoming", text: "followcheck:rule-fg:cm_9", sender: { id: "usr_9", name: "pepe" } },
        conversation: { id: "conv_1" },
        account: { id: "acct_1", accountId: "acct_1", platform: "instagram" },
      },
      env,
    );
    expect(out).toHaveLength(0); // no entra al agente
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    // follow-status + envío del link
    const sendCall = calls.find((c) => String(c[0]).includes("/conversations/"));
    expect(sendCall).toBeTruthy();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body.message).toBe("Aquí tienes el link:");
  });
});
