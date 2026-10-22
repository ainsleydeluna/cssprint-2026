// Database rows ↔ lib/types.ts shapes. Columns are the type's fields in
// snake_case (docs/spec.md section 8).

import type { Quote, QuoteLine, Receipt, Shop, Stem, StockBatch } from "../types";

export const SHOP_COLUMNS =
  "id, owner_id, name, wrap_fee, labor_fee, markup_percent, minimum_margin_percent, valid_for_days, created_at";
export const STEM_COLUMNS =
  "id, shop_id, flower, color, is_filler, unit, bundle_size, sample_price, sample_source, hidden";

type Row = Record<string, unknown>;

/** { markupPercent: 60 } → { markup_percent: 60 }, for inserts and updates. */
export function toColumns(fields: object): Row {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value]),
  );
}

// numeric columns arrive as JSON numbers; Number() guards against a string if
// the Data API is ever set to send numerics as text.

export function toShop(row: Row): Shop {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    wrapFee: Number(row.wrap_fee),
    laborFee: Number(row.labor_fee),
    markupPercent: Number(row.markup_percent),
    minimumMarginPercent: Number(row.minimum_margin_percent),
    validForDays: Number(row.valid_for_days),
    createdAt: String(row.created_at),
  };
}

export function toStem(row: Row): Stem {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    flower: String(row.flower),
    color: String(row.color),
    isFiller: Boolean(row.is_filler),
    unit: row.unit as Stem["unit"],
    bundleSize: row.bundle_size === null ? null : Number(row.bundle_size),
    samplePrice: Number(row.sample_price),
    sampleSource: String(row.sample_source),
    hidden: Boolean(row.hidden),
  };
}

export const RECEIPT_COLUMNS = "id, shop_id, purchase_date, photo_path, created_at";
export const BATCH_COLUMNS =
  "id, receipt_id, shop_id, stem_id, quantity, unit, bundle_size, total_paid, cost_per_stem, created_at";

export function toReceipt(row: Row): Receipt {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    purchaseDate: String(row.purchase_date),
    photoPath: String(row.photo_path),
    createdAt: String(row.created_at),
  };
}

export function toStockBatch(row: Row): StockBatch {
  return {
    id: String(row.id),
    receiptId: String(row.receipt_id),
    shopId: String(row.shop_id),
    stemId: String(row.stem_id),
    quantity: Number(row.quantity),
    unit: row.unit as StockBatch["unit"],
    bundleSize: row.bundle_size === null ? null : Number(row.bundle_size),
    totalPaid: Number(row.total_paid),
    costPerStem: Number(row.cost_per_stem),
    createdAt: String(row.created_at),
  };
}

export const QUOTE_COLUMNS =
  "id, shop_id, label, status, photo_path, budget, price, reply_text, valid_until, underwater_at, created_at, sent_at";
export const LINE_COLUMNS =
  "id, quote_id, shop_id, stem_id, count, count_low, count_high, confidence, note, cost_per_stem";

const money = (value: unknown) => (value === null ? null : Number(value));
const text = (value: unknown) => (value === null ? null : String(value));

export function toQuote(row: Row): Quote {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    label: String(row.label),
    status: row.status as Quote["status"],
    photoPath: String(row.photo_path),
    budget: money(row.budget),
    price: money(row.price),
    replyText: String(row.reply_text),
    validUntil: text(row.valid_until),
    underwaterAt: text(row.underwater_at),
    createdAt: String(row.created_at),
    sentAt: text(row.sent_at),
  };
}

export function toQuoteLine(row: Row): QuoteLine {
  return {
    id: String(row.id),
    quoteId: String(row.quote_id),
    shopId: String(row.shop_id),
    stemId: text(row.stem_id),
    count: row.count === null ? null : Number(row.count),
    countLow: Number(row.count_low),
    countHigh: Number(row.count_high),
    confidence: row.confidence as QuoteLine["confidence"],
    note: String(row.note),
    costPerStem: Number(row.cost_per_stem),
  };
}
