import { describe, it, expect } from "vitest";
import { renderQuoteHtml, DEFAULT_QUOTE_TEMPLATE } from "../../src/quotes/template";
import type { Quote, QuoteItem } from "../../src/db/quotes";

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    conversation_id: "c1",
    lead_id: null,
    channel: "telegram",
    channel_user_id: "u1",
    number: "COT-202610-0001",
    status: "draft",
    client_name: "Ana López",
    client_contact: "+52 55 1234",
    event_type: "XV años",
    event_date: "2026-11-15",
    event_place: "Salón Real",
    guests: 120,
    notes: "Incluye montaje",
    currency: "MXN",
    subtotal: 6600,
    discount: 100,
    tax: 0,
    deposit: 2000,
    total: 6500,
    valid_until: "2026-10-30",
    created_by: "bot",
    payload: null,
    created_at: Date.UTC(2026, 9, 8),
    updated_at: Date.UTC(2026, 9, 8),
    sent_at: null,
    sent_count: 0,
    ...over,
  };
}

const items: QuoteItem[] = [
  { id: "i1", quote_id: "q1", name: "Photobooth 4h", description: "Con impresiones", qty: 1, unit_price: 4800, total: 4800, sort_order: 0 },
  { id: "i2", quote_id: "q1", name: "Hora extra", description: null, qty: 2, unit_price: 900, total: 1800, sort_order: 1 },
];

describe("renderQuoteHtml", () => {
  it("rellena marcadores y el bloque de ítems", () => {
    const html = renderQuoteHtml(DEFAULT_QUOTE_TEMPLATE, { businessName: "Fiestas SA", quote: quote(), items });
    expect(html).toContain("Fiestas SA");
    expect(html).toContain("COT-202610-0001");
    expect(html).toContain("Ana López");
    expect(html).toContain("XV años");
    expect(html).toContain("Photobooth 4h");
    expect(html).toContain("Hora extra");
    expect(html).not.toContain("{{#items}}");
    expect(html).not.toContain("{{number}}");
  });

  it("escapa HTML de los datos del cliente (anti-inyección)", () => {
    const html = renderQuoteHtml(DEFAULT_QUOTE_TEMPLATE, {
      businessName: "X",
      quote: quote({ client_name: "<script>alert(1)</script>" }),
      items,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("usa la plantilla personalizada del dueño", () => {
    const custom = "<h1>{{business_name}}</h1><p>{{client_name}}</p>{{#items}}<b>{{name}}</b>{{/items}}";
    const html = renderQuoteHtml(custom, { businessName: "Negocio", quote: quote({ client_name: "Bob" }), items: [items[0]] });
    expect(html).toBe("<h1>Negocio</h1><p>Bob</p><b>Photobooth 4h</b>");
  });
});
