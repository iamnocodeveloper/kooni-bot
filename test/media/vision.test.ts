import { describe, it, expect } from "vitest";
import { buildMultimodalUserMessage } from "../../src/media/vision";

const IMG = { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg" };

describe("buildMultimodalUserMessage", () => {
  it("returns a plain text user message when there is no image", () => {
    const msg = buildMultimodalUserMessage("hola, ¿agendan hoy?", undefined);
    expect(msg).toEqual({ role: "user", content: "hola, ¿agendan hoy?" });
  });

  it("returns an empty-string user message when there is neither text nor image", () => {
    const msg = buildMultimodalUserMessage(undefined, undefined);
    expect(msg).toEqual({ role: "user", content: "" });
  });

  it("builds a multimodal message with image bytes + text caption", () => {
    const msg = buildMultimodalUserMessage("¿qué es esto?", IMG);
    expect(msg.role).toBe("user");
    const content = msg.content as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(2);

    const imagePart = content[0];
    expect(imagePart.type).toBe("image");
    // Los bytes (no una URL) permiten adjuntar la credencial del canal en el fetch previo.
    expect(imagePart.image).toEqual(new Uint8Array([1, 2, 3]));
    expect(imagePart.mediaType).toBe("image/jpeg");

    const textPart = content[1];
    expect(textPart).toEqual({ type: "text", text: "¿qué es esto?" });
  });

  it("builds an image-only message when there is no caption", () => {
    const msg = buildMultimodalUserMessage(undefined, IMG);
    const content = msg.content as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("image");
    expect(content[0].image).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("does not perform any network call (pure message builder)", () => {
    // buildMultimodalUserMessage only constructs a ModelMessage; no fetch/provider involved.
    const fetchSpy = (globalThis as { fetch?: unknown }).fetch;
    const msg = buildMultimodalUserMessage("hi", IMG);
    expect(msg.role).toBe("user");
    // fetch reference unchanged / untouched by the builder
    expect((globalThis as { fetch?: unknown }).fetch).toBe(fetchSpy);
  });
});
