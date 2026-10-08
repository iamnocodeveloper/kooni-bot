import { Db } from "./client";

// Cotizaciones (nicho eventos, extensible a otros giros): borrador editable +
// PDF enviable por la conversación. Tablas: quotes / quote_items / quote_events
// (ver schema.sql). El catálogo de precios reutiliza `products`.

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";
export const QUOTE_STATUSES: readonly QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

export interface Quote {
  id: string;
  conversation_id: string | null;
  lead_id: string | null;
  channel: string | null;
  channel_user_id: string | null;
  number: string | null;
  status: QuoteStatus;
  client_name: string | null;
  client_contact: string | null;
  event_type: string | null;
  event_date: string | null;
  event_place: string | null;
  guests: number | null;
  notes: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  deposit: number;
  total: number;
  valid_until: string | null;
  created_by: string | null;
  payload: string | null;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
  sent_count: number;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  name: string;
  description: string | null;
  qty: number;
  unit_price: number;
  total: number;
  sort_order: number;
}

export interface QuoteEvent {
  id: string;
  quote_id: string;
  kind: string;
  detail: string | null;
  at: number;
}

export interface QuoteItemInput {
  name: string;
  description?: string | null;
  qty: number;
  unitPrice: number;
}

export interface UpsertQuoteInput {
  id?: string;
  conversationId?: string | null;
  leadId?: string | null;
  channel?: string | null;
  channelUserId?: string | null;
  clientName?: string | null;
  clientContact?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  eventPlace?: string | null;
  guests?: number | null;
  notes?: string | null;
  currency?: string;
  discount?: number;
  tax?: number;
  deposit?: number;
  validUntil?: string | null;
  createdBy?: string | null;
  status?: QuoteStatus;
  items?: QuoteItemInput[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export class QuotesRepo {
  constructor(private readonly db: Db) {}

  /** Siguiente número de cotización legible: COT-YYYYMM-####. */
  async nextNumber(): Promise<string> {
    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = await this.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM quotes");
    const seq = (row?.n ?? 0) + 1;
    return `COT-${ym}-${String(seq).padStart(4, "0")}`;
  }

  private computeTotals(items: QuoteItemInput[], discount: number, tax: number): { subtotal: number; total: number } {
    const subtotal = round2(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0));
    const total = round2(subtotal - (Number(discount) || 0) + (Number(tax) || 0));
    return { subtotal, total };
  }

  /** Crea una cotización (con sus ítems si vienen). Devuelve id y número. */
  async create(input: UpsertQuoteInput): Promise<{ id: string; number: string }> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const number = await this.nextNumber();
    const items = input.items ?? [];
    const { subtotal, total } = this.computeTotals(items, input.discount ?? 0, input.tax ?? 0);
    await this.db.run(
      `INSERT INTO quotes (
        id, conversation_id, lead_id, channel, channel_user_id, number, status,
        client_name, client_contact, event_type, event_date, event_place, guests, notes,
        currency, subtotal, discount, tax, deposit, total, valid_until, created_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.conversationId ?? null,
        input.leadId ?? null,
        input.channel ?? null,
        input.channelUserId ?? null,
        number,
        input.status ?? "draft",
        input.clientName ?? null,
        input.clientContact ?? null,
        input.eventType ?? null,
        input.eventDate ?? null,
        input.eventPlace ?? null,
        input.guests ?? null,
        input.notes ?? null,
        input.currency ?? "USD",
        subtotal,
        input.discount ?? 0,
        input.tax ?? 0,
        input.deposit ?? 0,
        total,
        input.validUntil ?? null,
        input.createdBy ?? null,
        now,
        now,
      ],
    );
    if (items.length) await this.setItems(id, items);
    await this.addEvent(id, "created", input.createdBy ?? null);
    return { id, number };
  }

  /** Actualiza los campos de cabecera (no toca ítems). */
  async update(id: string, patch: Partial<UpsertQuoteInput>): Promise<void> {
    const map: [keyof UpsertQuoteInput, string][] = [
      ["clientName", "client_name"],
      ["clientContact", "client_contact"],
      ["eventType", "event_type"],
      ["eventDate", "event_date"],
      ["eventPlace", "event_place"],
      ["notes", "notes"],
      ["currency", "currency"],
      ["validUntil", "valid_until"],
      ["status", "status"],
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, col] of map) {
      if (patch[key] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(patch[key]);
      }
    }
    for (const [key, col] of [["discount", "discount"], ["tax", "tax"], ["deposit", "deposit"], ["guests", "guests"]] as [keyof UpsertQuoteInput, string][]) {
      if (patch[key] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(patch[key]);
      }
    }
    if (!sets.length) return;
    sets.push("updated_at = ?");
    params.push(Date.now());
    params.push(id);
    await this.db.run(`UPDATE quotes SET ${sets.join(", ")} WHERE id = ?`, params);
    await this.recomputeTotals(id);
  }

  /** Reemplaza los ítems y recalcula subtotal/total. */
  async setItems(id: string, items: QuoteItemInput[]): Promise<void> {
    await this.db.run("DELETE FROM quote_items WHERE quote_id = ?", [id]);
    let order = 0;
    for (const it of items) {
      const qty = Number(it.qty) || 0;
      const unitPrice = Number(it.unitPrice) || 0;
      await this.db.run(
        `INSERT INTO quote_items (id, quote_id, name, description, qty, unit_price, total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), id, it.name || "(sin nombre)", it.description ?? null, qty, unitPrice, round2(qty * unitPrice), order++],
      );
    }
    await this.recomputeTotals(id);
  }

  /** Recalcula subtotal/total a partir de los ítems + descuento/impuesto. */
  async recomputeTotals(id: string): Promise<void> {
    const quote = await this.get(id);
    if (!quote) return;
    const items = await this.items(id);
    const subtotal = round2(items.reduce((s, it) => s + it.total, 0));
    const total = round2(subtotal - quote.discount + quote.tax);
    await this.db.run("UPDATE quotes SET subtotal = ?, total = ?, updated_at = ? WHERE id = ?", [
      subtotal,
      total,
      Date.now(),
      id,
    ]);
  }

  async get(id: string): Promise<Quote | null> {
    return this.db.first<Quote>("SELECT * FROM quotes WHERE id = ?", [id]);
  }

  async byConversation(conversationId: string, limit = 20): Promise<Quote[]> {
    return this.db.all<Quote>(
      "SELECT * FROM quotes WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
      [conversationId, limit],
    );
  }

  /** El borrador más reciente de la conversación (para reusar en vez de duplicar). */
  async latestDraft(conversationId: string): Promise<Quote | null> {
    return this.db.first<Quote>(
      "SELECT * FROM quotes WHERE conversation_id = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1",
      [conversationId],
    );
  }

  async items(quoteId: string): Promise<QuoteItem[]> {
    return this.db.all<QuoteItem>(
      "SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order ASC, rowid ASC",
      [quoteId],
    );
  }

  async events(quoteId: string): Promise<QuoteEvent[]> {
    return this.db.all<QuoteEvent>("SELECT * FROM quote_events WHERE quote_id = ? ORDER BY at ASC", [quoteId]);
  }

  async list(limit = 100): Promise<Quote[]> {
    return this.db.all<Quote>("SELECT * FROM quotes ORDER BY created_at DESC LIMIT ?", [limit]);
  }

  /** La cotización más reciente por conversación (para el chip del kanban). */
  async latestByConversations(ids: string[]): Promise<Record<string, Quote>> {
    const out: Record<string, Quote> = {};
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return out;
    const CHUNK = 90; // límite de parámetros de D1
    for (let i = 0; i < unique.length; i += CHUNK) {
      const slice = unique.slice(i, i + CHUNK);
      const placeholders = slice.map(() => "?").join(",");
      const rows = await this.db.all<Quote>(
        `SELECT * FROM quotes WHERE conversation_id IN (${placeholders}) ORDER BY created_at ASC`,
        slice,
      );
      // Orden ascendente: el último gana → la más reciente por conversación.
      for (const q of rows) if (q.conversation_id) out[q.conversation_id] = q;
    }
    return out;
  }

  async setStatus(id: string, status: QuoteStatus): Promise<void> {
    await this.db.run("UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?", [status, Date.now(), id]);
    await this.addEvent(id, `status:${status}`, null);
  }

  async markSent(id: string): Promise<void> {
    await this.db.run(
      "UPDATE quotes SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = ?, sent_count = sent_count + 1, updated_at = ? WHERE id = ?",
      [Date.now(), Date.now(), id],
    );
    await this.addEvent(id, "sent", null);
  }

  async addEvent(quoteId: string, kind: string, detail: string | null): Promise<void> {
    await this.db.run(
      "INSERT INTO quote_events (id, quote_id, kind, detail, at) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), quoteId, kind, detail, Date.now()],
    );
  }
}
