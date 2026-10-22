// Request bodies for the shop, stem and quote routes. Only the fields named in the
// lib/contract.ts request type get through; anything else (id, shopId, price,
// status, …) is ignored, never copied onto the row. Ranges match the checks in
// supabase/migrations, so a bad value answers invalid_request, not a database error.

import { isManilaDate } from "../ai/shared";
import type {
  AddStemRequest,
  CopiedRequest,
  CreateQuoteRequest,
  UpdateQuoteLinesRequest,
  UpdateQuoteRequest,
  UpdateShopRequest,
  UpdateStemRequest,
} from "../contract";
import { COUNT_LIMITS } from "../money";
import type { Confidence, Stem, Unit } from "../types";

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

const date: Check = (value) => (typeof value === "string" && isManilaDate(value) ? value : undefined);

function nullable(check: Check): Check {
  return (value) => (value === null ? null : check(value));
}

/** Long enough for a Taglish reply many times over. */
const replyText = text(2000);

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

function isRecord(body: unknown): body is Record<string, unknown> {
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

const QUOTE_UPDATE_FIELDS: Record<keyof UpdateQuoteRequest, Check> = {
  label: name(80),
  budget: nullable(money),
  // A sent quote always has a valid-until date (quotes_sent_complete), so it is never cleared.
  validUntil: date,
  replyText,
};

/** PATCH /api/quotes/[id]. */
export function parseQuoteUpdate(body: unknown): Parsed<UpdateQuoteRequest> {
  return pick<UpdateQuoteRequest>(body, QUOTE_UPDATE_FIELDS);
}

/** More lines than any bouquet needs; keeps one request's writes small. */
const MAX_LINES = 50;

const CONFIDENCES: readonly Confidence[] = ["low", "medium", "high"];

const LINE_FIELDS: Record<keyof Omit<QuoteLineInput, "id">, Check> = {
  stemId: nullable(text(36)),
  count: nullable(number(1, COUNT_LIMITS.stemsPerLine, { whole: true })),
  countLow: number(0, 1000, { whole: true }),
  countHigh: number(0, 1000, { whole: true }),
  confidence: (value) => (CONFIDENCES.includes(value as Confidence) ? value : undefined),
  note: text(500),
};

type QuoteLineInput = UpdateQuoteLinesRequest["lines"][number];

/**
 * PUT /api/quotes/[id]/lines: the florist's whole recipe. Counts are kept as
 * typed, never clamped: a line outside 1–100 stems or 1–5 filler bunches is
 * refused (the 200-stem bouquet limit applies only to AI answers). Each stem
 * must be one of the shop's rows, and each line id one of this quote's lines.
 */
export function parseQuoteLines(
  body: unknown,
  context: { stems: Pick<Stem, "id" | "isFiller">[]; lineIds: string[] },
): Parsed<QuoteLineInput[]> {
  if (!isRecord(body) || !Array.isArray(body.lines)) return invalid("lines must be a list");
  if (body.lines.length > MAX_LINES) return invalid(`At most ${MAX_LINES} lines`);
  const seen = new Set<string>();
  const lines: QuoteLineInput[] = [];
  for (const item of body.lines) {
    const picked = pick<QuoteLineInput>(item, LINE_FIELDS);
    if (!picked.ok) return picked;
    const missing = Object.keys(LINE_FIELDS).find((field) => !Object.hasOwn(picked.value, field));
    if (missing) return invalid(`Missing ${missing}`);
    const line = picked.value as QuoteLineInput;

    if (line.countHigh < line.countLow) return invalid("countHigh is below countLow");
    const stem = line.stemId === null ? undefined : context.stems.find((row) => row.id === line.stemId);
    if (line.stemId !== null && !stem) return invalid("Invalid stemId");
    if (stem?.isFiller && line.count !== null && line.count > COUNT_LIMITS.bunchesPerLine) {
      return invalid(`A filler line holds at most ${COUNT_LIMITS.bunchesPerLine} bunches`);
    }

    const id = (item as Record<string, unknown>).id;
    if (id !== undefined) {
      if (typeof id !== "string" || !context.lineIds.includes(id) || seen.has(id)) return invalid("Invalid line id");
      seen.add(id);
      line.id = id;
    }
    lines.push(line);
  }
  return { ok: true, value: lines };
}

/** POST /api/quotes/[id]/copied: the text as copied, never empty. */
export function parseCopied(body: unknown): Parsed<CopiedRequest> {
  const picked = pick<CopiedRequest>(body, { replyText: name(2000) });
  if (!picked.ok) return picked;
  return picked.value.replyText === undefined ? invalid("Missing replyText") : { ok: true, value: { replyText: picked.value.replyText } };
}

/** "<shop_id>/<uuid>.jpg", as POST /api/photos returns it. */
export function isShopPhotoPath(photoPath: string, shopId: string): boolean {
  return photoPath.startsWith(`${shopId}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(photoPath);
}

/** POST /api/quotes: a bouquet photo in the shop's own folder. */
export function parseCreateQuote(body: unknown, shopId: string): Parsed<CreateQuoteRequest> {
  if (!isRecord(body) || typeof body.photoPath !== "string" || !isShopPhotoPath(body.photoPath, shopId)) {
    return invalid("Invalid photoPath");
  }
  return { ok: true, value: { photoPath: body.photoPath } };
}
