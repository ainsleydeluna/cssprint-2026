// All money math (docs/spec.md section 7). Pure: no database, no network.
// Imported by both route handlers and screens, so totals always agree.

import type { CountPrefill } from "./ai/config";
import type { ManilaDate, Money, QuoteLine, Shop, Stem, StockBatch, Unit } from "./types";

/** Rounds to two decimals. EPSILON keeps 1.005 from rounding down to 1.00. */
function roundMoney(amount: number): Money {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Stems in one unit. A bunch is priced whole, so it counts as one. */
function stemsPerUnit(unit: Unit, bundleSize: number | null): number {
  switch (unit) {
    case "dozen":
      return 12;
    case "per10":
      return 10;
    case "bundle":
      return bundleSize ?? 1;
    case "bunch":
    case "piece":
      return 1;
  }
}

/** Cost of one stem (one bunch for fillers) in a stock batch. */
export function costPerStem(
  batch: Pick<StockBatch, "quantity" | "unit" | "bundleSize" | "totalPaid">,
): Money {
  return roundMoney(batch.totalPaid / (batch.quantity * stemsPerUnit(batch.unit, batch.bundleSize)));
}

/** A stock batch with its receipt's purchase date, as latestCost needs it. */
export type DatedBatch = Pick<StockBatch, "stemId" | "costPerStem" | "createdAt"> & {
  purchaseDate: ManilaDate;
};

/**
 * What one stem (one bunch for fillers) costs the shop now: the newest batch by
 * purchase date, ties going to the one entered last; else the sample price.
 */
export function latestCost(
  stem: Pick<Stem, "id" | "unit" | "bundleSize" | "samplePrice">,
  batches: DatedBatch[],
): { cost: Money; isSample: boolean } {
  let newest: DatedBatch | undefined;
  for (const batch of batches) {
    if (batch.stemId !== stem.id) continue;
    // ManilaDate and ISO timestamps both sort correctly as strings.
    if (
      !newest ||
      batch.purchaseDate > newest.purchaseDate ||
      (batch.purchaseDate === newest.purchaseDate && batch.createdAt > newest.createdAt)
    ) {
      newest = batch;
    }
  }
  if (newest) return { cost: newest.costPerStem, isSample: false };
  return { cost: roundMoney(stem.samplePrice / stemsPerUnit(stem.unit, stem.bundleSize)), isSample: true };
}

/**
 * What a recipe costs at its lines' costs. Fillers are counted in bunches and
 * costed per bunch, so one formula covers both. A blank count or a "pick a
 * flower" line adds nothing and marks the recipe incomplete.
 */
export function recipeCost(lines: Pick<QuoteLine, "stemId" | "count" | "costPerStem">[]): {
  cost: Money;
  incomplete: boolean;
} {
  let cost = 0;
  let incomplete = false;
  for (const line of lines) {
    if (line.stemId === null || line.count === null) {
      incomplete = true;
      continue;
    }
    cost += line.count * line.costPerStem;
  }
  return { cost: roundMoney(cost), incomplete };
}

/** Rounds up to the nearest ₱10, after rounding to centavos so float noise never adds ₱10. */
function roundUp10(amount: number): Money {
  return Math.ceil(roundMoney(amount) / 10) * 10;
}

/** The customer's price. Markup applies to the recipe cost only, never to fees. */
export function price(
  recipeCost: Money,
  shop: Pick<Shop, "markupPercent" | "wrapFee" | "laborFee">,
): Money {
  return roundUp10(recipeCost * (1 + shop.markupPercent / 100) + shop.wrapFee + shop.laborFee);
}

/** Share of the price the shop keeps: (price − recipe cost at latest costs) ÷ price. 0 for a ₱0 price. */
export function margin(price: Money, recipeCostAtLatest: Money): number {
  if (price === 0) return 0;
  return (price - recipeCostAtLatest) / price;
}

/**
 * True when the margin at latest costs is below the shop's minimum margin.
 * Callers pass open quotes only (sent and not expired).
 */
export function isUnderwater(
  price: Money,
  recipeCostAtLatest: Money,
  shop: Pick<Shop, "minimumMarginPercent">,
): boolean {
  return margin(price, recipeCostAtLatest) < shop.minimumMarginPercent / 100;
}

/** Count limits from spec decisions 8 and 25. */
export const COUNT_LIMITS = { stemsPerLine: 100, bunchesPerLine: 5, stemsPerBouquet: 200 } as const;

/** A whole count within a line's limits: 1–100 stems, or 1–5 filler bunches. */
export function clampCount(count: number, isFiller: boolean): number {
  const max = isFiller ? COUNT_LIMITS.bunchesPerLine : COUNT_LIMITS.stemsPerLine;
  return Math.min(max, Math.max(1, Math.round(count)));
}

/** A new line's starting count from the AI's count range. */
export function prefillCount(countLow: number, countHigh: number, rule: CountPrefill): number {
  switch (rule) {
    case "middle":
      return Math.ceil((countLow + countHigh) / 2);
  }
}

/**
 * Keeps a bouquet's flower stems at 200 or fewer by scaling every flower line
 * down by the same factor (never below 1), so the mix of flowers stays the same.
 * Filler bunches and blank counts are left alone.
 */
export function clampBouquet<T extends { count: number | null; isFiller: boolean }>(lines: T[]): T[] {
  let total = 0;
  for (const line of lines) if (!line.isFiller && line.count !== null) total += line.count;
  if (total <= COUNT_LIMITS.stemsPerBouquet) return lines;

  const factor = COUNT_LIMITS.stemsPerBouquet / total;
  return lines.map((line) =>
    line.isFiller || line.count === null
      ? line
      : { ...line, count: Math.max(1, Math.floor(line.count * factor)) },
  );
}
