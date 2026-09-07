import { describe, it, expect, beforeEach } from "vitest";
import { createTestMiniflare } from "../helpers/miniflareSetup";
import { Db } from "../../src/db/client";
import { ConversationsRepo } from "../../src/db/conversations";
import { MessagesRepo } from "../../src/db/messages";

let convRepo: ConversationsRepo;
let msgRepo: MessagesRepo;
let convId: string;

beforeEach(async () => {
  const mf = await createTestMiniflare();
  const d1 = await mf.getD1Database("DB");
  const db = new Db(d1 as any);
  convRepo = new ConversationsRepo(db);
  msgRepo = new MessagesRepo(db);
  const conv = await convRepo.getOrCreate("telegram", "user_999");
  convId = conv.id;
});

describe("MessagesRepo", () => {
  it("appends and retrieves messages in chronological order", async () => {
    await msgRepo.append(convId, "user", "hola");
    await msgRepo.append(convId, "assistant", "hola María, qué tal");
    const msgs = await msgRepo.lastN(convId, 20);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("hola");
    expect(msgs[1].content).toBe("hola María, qué tal");
  });

  it("lastN respects the limit", async () => {
    for (let i = 0; i < 25; i++) {
      await msgRepo.append(convId, "user", `msg ${i}`);
    }
    const msgs = await msgRepo.lastN(convId, 20);
    expect(msgs).toHaveLength(20);
    // last 20 means msgs 5-24
    expect(msgs[0].content).toBe("msg 5");
    expect(msgs[19].content).toBe("msg 24");
  });

  it("purgeOlderThan deletes messages past the cutoff", async () => {
    await msgRepo.append(convId, "user", "old", { createdAt: Date.now() - 100 * 86_400_000 });
    await msgRepo.append(convId, "user", "new");
    const deleted = await msgRepo.purgeOlderThan(Date.now() - 90 * 86_400_000);
    expect(deleted).toBe(1);
    const msgs = await msgRepo.lastN(convId, 20);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("new");
  });

  // § V Fase 3 (docs/PLAN.md) — botones adjuntos a una respuesta.
  describe("saveButtons / buttonsForMessages", () => {
    it("guarda y devuelve los botones de un mensaje, en orden", async () => {
      const msgId = await msgRepo.append(convId, "assistant", "elige una opción");
      await msgRepo.saveButtons(msgId, [
        { text: "Ver catálogo", url: "https://ejemplo.com/catalogo" },
        { text: "Agendar", callback: "agendar_click" },
      ]);
      const byMsg = await msgRepo.buttonsForMessages([msgId]);
      expect(byMsg.get(msgId)).toEqual([
        { label: "Ver catálogo", kind: "url", value: "https://ejemplo.com/catalogo" },
        { label: "Agendar", kind: "callback", value: "agendar_click" },
      ]);
    });

    it("mensaje sin botones: no aparece en el mapa", async () => {
      const msgId = await msgRepo.append(convId, "assistant", "sin botones");
      const byMsg = await msgRepo.buttonsForMessages([msgId]);
      expect(byMsg.has(msgId)).toBe(false);
    });

    it("lista vacía de ids no consulta nada y devuelve un mapa vacío", async () => {
      const byMsg = await msgRepo.buttonsForMessages([]);
      expect(byMsg.size).toBe(0);
    });

    it("agrupa botones de varios mensajes en una sola pasada", async () => {
      const id1 = await msgRepo.append(convId, "assistant", "uno");
      const id2 = await msgRepo.append(convId, "assistant", "dos");
      await msgRepo.saveButtons(id1, [{ text: "A", url: "https://a.test" }]);
      await msgRepo.saveButtons(id2, [{ text: "B", url: "https://b.test" }]);
      const byMsg = await msgRepo.buttonsForMessages([id1, id2]);
      expect(byMsg.get(id1)).toEqual([{ label: "A", kind: "url", value: "https://a.test" }]);
      expect(byMsg.get(id2)).toEqual([{ label: "B", kind: "url", value: "https://b.test" }]);
    });
  });
});
