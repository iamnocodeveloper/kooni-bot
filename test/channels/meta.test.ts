import { describe, it, expect } from "vitest";
import { parseMetaEvents } from "../../src/channels/meta";

const wrap = (messaging: any) => ({
  object: "instagram",
  entry: [{ id: "page_1", messaging: [messaging] }],
});

describe("parseMetaEvents", () => {
  it("convierte un DM entrante en mensaje para el agente", () => {
    const [msg] = parseMetaEvents(
      wrap({ sender: { id: "usr_1" }, recipient: { id: "page_1" }, message: { mid: "m1", text: "hola" } }),
    );
    expect(msg.channel).toBe("instagram");
    expect(msg.channelUserId).toBe("usr_1");
    expect(msg.text).toBe("hola");
    expect(msg.ownerEcho).toBeUndefined();
  });

  it("marca un echo (respuesta desde la app nativa) como ownerEcho, contra el cliente", () => {
    const [msg] = parseMetaEvents(
      wrap({
        sender: { id: "page_1" },
        recipient: { id: "usr_1" },
        message: { mid: "m2", text: "te respondo desde el celu", is_echo: true },
      }),
    );
    expect(msg.ownerEcho).toBe(true);
    expect(msg.channelUserId).toBe("usr_1"); // el hilo es del cliente, no de la Página
    expect(msg.text).toBe("te respondo desde el celu");
  });

  it("ignora un echo sin texto y los recibos de entrega/lectura", () => {
    expect(
      parseMetaEvents(wrap({ sender: { id: "page_1" }, recipient: { id: "usr_1" }, message: { mid: "m3", is_echo: true } })),
    ).toHaveLength(0);
    expect(parseMetaEvents(wrap({ sender: { id: "usr_1" }, delivery: { mids: ["m1"] } }))).toHaveLength(0);
  });
});
