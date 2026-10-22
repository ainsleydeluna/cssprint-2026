// Request bodies for the shop and stem routes. Only the fields named in the
// lib/contract.ts request type get through; anything else (id, shopId, price,
// status, …) is ignored, never copied onto the row. Ranges match the checks in
// supabase/migrations, so a bad value answers invalid_request, not a database error.

import type { AddStemRequest, UpdateShopRequest, UpdateStemRequest } from "../contract";
import type { Stem, Unit } from "../types";

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
