// Request bodies for the shop, stem and receipt routes. Only the fields named in the
// lib/contract.ts request type get through; anything else (id, shopId, price,
// status, …) is ignored, never copied onto the row. Ranges match the checks in
// supabase/migrations, so a bad value answers invalid_request, not a database error.

import type { AddStemRequest, SaveReceiptRequest, UpdateShopRequest, UpdateStemRequest } from "../contract";
import { costPerStem, roundMoney } from "../money";
import type { ManilaDate, Money, Stem, Unit } from "../types";

export type Parsed<T> = { ok: true; value: T } | { ok: false; code: "invalid_request" | "invalid_bundle_size"; error: string };

/** A field's value, cleaned, or undefined when it is not allowed. */
type Check = (value: unknown) => unknown;

/** numeric(10,2) in the database. */
const MAX_MONEY = 99_999_999.99;

function text(maxLength: number): Check {
  return (value) => (typeof value === "string" && value.trim().length <= maxLength ? value.trim() : undefined);
}

function number(min: number, max: number, { whole = false } = {}): Check {
  return (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!whole || Number.isInteger(value))
      ? value
      : undefined;
}

const money = number(0, MAX_MONEY);

const boolean: Check = (value) => (typeof value === "boolean" ? value : undefined);

const UNITS: readonly Unit[] = ["dozen", "per10", "bundle", "bunch", "piece"];
const unit: Check = (value) => (UNITS.includes(value as Unit) ? value : undefined);

/** Whole stems, or null. Zero and below pass here; stemBundle answers invalid_bundle_size for them. */
const bundleSize: Check = (value) => (value === null ? null : number(-1000, 1000, { whole: true })(value));

function name(maxLength: number): Check {
  return (value) => {
    const trimmed = text(maxLength)(value);
    return trimmed === "" ? undefined : trimmed;
  };
}

/** " - " joins flower and color in a row's name ("Rose - red"), so it may not appear inside either. */
function namePart(check: Check): Check {
  return (value) => {
    const checked = check(value);
    return typeof checked === "string" && checked.includes(" - ") ? undefined : checked;
  };
}

const SHOP_FIELDS: Record<keyof UpdateShopRequest, Check> = {
  name: text(80),
  wrapFee: money,
  laborFee: money,
  markupPercent: number(0, 9999.99),
  minimumMarginPercent: number(0, 100),
  validForDays: number(1, 60, { whole: true }),
};

export function isRecord(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function invalid(error: string): Parsed<never> {
  return { ok: false, code: "invalid_request", error };
}

/** Picks and checks the fields of `body` that `rules` names. */
function pick<T>(body: unknown, rules: Record<string, Check>): Parsed<Partial<T>> {
  if (!isRecord(body)) return invalid("Body must be a JSON object");
  const value: Record<string, unknown> = {};
  for (const [field, check] of Object.entries(rules)) {
    if (!Object.hasOwn(body, field)) continue;
    const checked = check(body[field]);
    if (checked === undefined) return invalid(`Invalid ${field}`);
    value[field] = checked;
  }
  return { ok: true, value: value as Partial<T> };
}

/** PATCH /api/shop. */
export function parseShopUpdate(body: unknown): Parsed<UpdateShopRequest> {
  return pick<UpdateShopRequest>(body, SHOP_FIELDS);
}

const NEW_STEM_FIELDS: Record<keyof AddStemRequest, Check> = {
  flower: namePart(name(60)),
  color: namePart(text(40)),
  isFiller: boolean,
  unit,
  bundleSize,
  samplePrice: money,
};

/**
 * A bundle row needs a bundle size above 0 (the stems_bundle_size_check in the
 * database); any other row stores none.
 */
function stemBundle<T extends Pick<Stem, "unit" | "bundleSize">>(stem: T): Parsed<T> {
  if (stem.unit !== "bundle") return { ok: true, value: { ...stem, bundleSize: null } };
  if (stem.bundleSize === null || stem.bundleSize <= 0) {
    return { ok: false, code: "invalid_bundle_size", error: "A bundle stem needs a bundle size above 0" };
  }
  return { ok: true, value: stem };
}

/** POST /api/stems. Every field of AddStemRequest is required. */
export function parseNewStem(body: unknown): Parsed<AddStemRequest> {
  const picked = pick<AddStemRequest>(body, NEW_STEM_FIELDS);
  if (!picked.ok) return picked;
  const missing = Object.keys(NEW_STEM_FIELDS).find((field) => !Object.hasOwn(picked.value, field));
  if (missing) return invalid(`Missing ${missing}`);
  return stemBundle(picked.value as AddStemRequest);
}

const STEM_UPDATE_FIELDS: Record<keyof UpdateStemRequest, Check> = { ...NEW_STEM_FIELDS, hidden: boolean };

/**
 * PATCH /api/stems/[id]: the changes to apply to `current`. The bundle rule is
 * checked on the row as it will be after the edit.
 */
export function parseStemUpdate(body: unknown, current: Stem): Parsed<UpdateStemRequest> {
  const picked = pick<UpdateStemRequest>(body, STEM_UPDATE_FIELDS);
  if (!picked.ok) return picked;
  const changes = picked.value;
  const bundleSizeAfter = Object.hasOwn(changes, "bundleSize") ? (changes.bundleSize ?? null) : current.bundleSize;
  const after = stemBundle({ unit: changes.unit ?? current.unit, bundleSize: bundleSizeAfter });
  if (!after.ok) return after;
  // Save the bundle size as it is after the edit (null unless the row is a bundle)
  // whenever the body sent one or it changes, so a stray size is never saved.
  if (Object.hasOwn(changes, "bundleSize") || after.value.bundleSize !== current.bundleSize) {
    changes.bundleSize = after.value.bundleSize;
  }
  return { ok: true, value: changes };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A photo path in the shop's own folder, as uploadPhoto makes it: "<shop_id>/<uuid>.jpg". */
export function isShopPhotoPath(path: unknown, shopId: string): path is string {
  if (typeof path !== "string") return false;
  const [folder, file, ...rest] = path.split("/");
  return (
    folder === shopId &&
    file !== undefined &&
    rest.length === 0 &&
    file.endsWith(".jpg") &&
    UUID.test(file.slice(0, -".jpg".length))
  );
}

/** "YYYY-MM-DD" that is a real calendar date. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Far more than one Dangwa receipt holds; keeps one save to a bounded transaction. */
const MAX_RECEIPT_LINES = 100;

/** A checked receipt line, with its cost per stem from lib/money.ts. */
export type SaveReceiptLine = SaveReceiptRequest["lines"][number] & { costPerStem: Money };

const RECEIPT_LINE_FIELDS: Record<keyof Omit<SaveReceiptRequest["lines"][number], "stemId">, Check> = {
  quantity: number(0.01, MAX_MONEY),
  unit,
  bundleSize,
  totalPaid: money,
};

/**
 * POST /api/receipts. Every line must be matched to a stem and have a cost per
 * stem (decision 20); the server recomputes that cost and never trusts one sent
 * in. A missing purchase date is today in Manila. The route still checks that
 * each stem is the shop's.
 */
export function parseSaveReceipt(
  body: unknown,
  { shopId, today }: { shopId: string; today: ManilaDate },
): Parsed<{ photoPath: string; purchaseDate: ManilaDate; lines: SaveReceiptLine[] }> {
  if (!isRecord(body)) return invalid("Body must be a JSON object");
  const { photoPath, purchaseDate = null, lines } = body;
  if (!isShopPhotoPath(photoPath, shopId)) return invalid("Invalid photoPath");
  if (purchaseDate !== null && !isCalendarDate(purchaseDate)) return invalid("Invalid purchaseDate");
  // "YYYY-MM-DD" dates compare correctly as strings.
  if (purchaseDate !== null && purchaseDate > today) return invalid("The purchase date is after today");
  if (!Array.isArray(lines) || lines.length === 0) return invalid("A receipt needs at least one line");
  if (lines.length > MAX_RECEIPT_LINES) return invalid(`A receipt has at most ${MAX_RECEIPT_LINES} lines`);

  const checked: SaveReceiptLine[] = [];
  for (const [i, line] of lines.entries()) {
    const n = i + 1;
    if (!isRecord(line)) return invalid(`Line ${n} must be an object`);
    if (typeof line.stemId !== "string" || !UUID.test(line.stemId)) return invalid(`Line ${n} has no stem`);
    const picked = pick<Omit<SaveReceiptLine, "stemId" | "costPerStem">>(line, RECEIPT_LINE_FIELDS);
    if (!picked.ok) return invalid(`${picked.error} on line ${n}`);
    const missing = Object.keys(RECEIPT_LINE_FIELDS).find((field) => !Object.hasOwn(picked.value, field));
    if (missing) return invalid(`Invalid ${missing} on line ${n}`);
    const fields = picked.value as Omit<SaveReceiptLine, "stemId" | "costPerStem">;
    const batch = {
      ...fields,
      stemId: line.stemId,
      // numeric(10,2) in receipt_lines, so the cost per stem is computed on the stored quantity.
      quantity: roundMoney(fields.quantity),
      bundleSize: fields.unit === "bundle" ? fields.bundleSize : null,
    };
    const cost = costPerStem(batch);
    if (cost === null) return invalid(`Line ${n} has no cost per stem`);
    checked.push({ ...batch, costPerStem: cost });
  }
  return { ok: true, value: { photoPath, purchaseDate: purchaseDate ?? today, lines: checked } };
}
