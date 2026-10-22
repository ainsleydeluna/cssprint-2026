// Database rows ↔ lib/types.ts shapes. Columns are the type's fields in
// snake_case (docs/spec.md section 8).

import type { Shop, Stem } from "../types";

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
