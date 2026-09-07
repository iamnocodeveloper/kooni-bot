import { describe, it, expect } from "vitest";
import { extractMedia, mediaSrc } from "../../src/admin/views/conversations";
import { TELEGRAM_TOKEN_MASK, maskTelegramToken } from "../../src/telegramFiles";

describe("extractMedia (hilo de conversaciones — §V Fase 2)", () => {
  it("mensaje sin media: texto intacto, sin imágenes ni audios", () => {
    const out = extractMedia("Hola, ¿tienen el Kia Sportage 2022?");
    expect(out).toEqual({ text: "Hola, ¿tienen el Kia Sportage 2022?", images: [], audios: [] });
  });

  it("saca el marcador de imagen del texto y lo devuelve aparte", () => {
    const out = extractMedia("mira mi carro\n[IMAGE_URL: https://ejemplo.com/x.jpg]");
    expect(out.text).toBe("mira mi carro");
    expect(out.images).toEqual(["https://ejemplo.com/x.jpg"]);
    expect(out.audios).toEqual([]);
  });

  it("saca el marcador de audio del texto y lo devuelve aparte", () => {
    const out = extractMedia("transcripción del audio\n[AUDIO_URL: https://ejemplo.com/x.ogg]");
    expect(out.text).toBe("transcripción del audio");
    expect(out.audios).toEqual(["https://ejemplo.com/x.ogg"]);
    expect(out.images).toEqual([]);
  });

  it("varios marcadores en el mismo mensaje (buffer con 2 fotos)", () => {
    const out = extractMedia("[IMAGE_URL: https://a.test/1.jpg]\n[IMAGE_URL: https://a.test/2.jpg]");
    expect(out.images).toEqual(["https://a.test/1.jpg", "https://a.test/2.jpg"]);
  });
});

describe("mediaSrc (a dónde apunta el <img>/<audio> del panel)", () => {
  it("una referencia waha: va al proxy /admin/media/waha", () => {
    const ref = "waha:http://waha.local/api/files/x.jpg";
    expect(mediaSrc(ref)).toBe(
      `/admin/media/waha?u=${encodeURIComponent("http://waha.local/api/files/x.jpg")}`,
    );
  });

  it("una referencia de Telegram enmascarada va al proxy /admin/media/telegram", () => {
    const ref = maskTelegramToken("https://api.telegram.org/file/bot12345:ABC/photos/x.jpg");
    expect(ref).toContain(TELEGRAM_TOKEN_MASK);
    expect(mediaSrc(ref)).toBe(`/admin/media/telegram?u=${encodeURIComponent(ref)}`);
  });

  it("cualquier otra URL (WhatsApp firmado, Meta, Zernio) se sirve directo", () => {
    const ref = "https://scontent.cdninstagram.com/v/abc.jpg";
    expect(mediaSrc(ref)).toBe(ref);
  });
});
