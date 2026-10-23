// All money math (docs/spec.md section 7). Pure: no database, no network.
// Imported by both route handlers and screens, so totals always agree.

import type { CountPrefill } from "./ai/config";
import type { ReceiptDraftLine } from "./contract";
import type { ManilaDate, Money, QuoteLine, Shop, Stem, StockBatch, Unit } from "./types";

/**
 * Rounds to two decimals, half up. Trimming to 15 significant digits first drops
 * float error, so 790.005 (stored as 790.00499...) rounds to 790.01.
 */
export function roundMoney(amount: number): Money {
  return Math.round(Number((amount * 100).toPrecision(15))) / 100;
}

/** Stems in one unit; null for a bundle with no size. A bunch is priced whole, so it counts as one. */
function stemsPerUnit(unit: Unit, bundleSize: number | null): number | null {
  switch (unit) {
    case "dozen":
      return 12;
    case "per10":
      return 10;
    case "bundle":
      return bundleSize !== null && bundleSize > 0 ? bundleSize : null;
    case "bunch":
    case "piece":
      return 1;
  }
}

/**
 * Cost of one stem (one bunch for fillers) in a stock batch. null when it cannot
 * be computed: a bundle with no bundle size, or a quantity of zero or less.
 * A receipt line with a null cost must be fixed before the receipt is saved.
 */
export function costPerStem(
  batch: Pick<StockBatch, "quantity" | "unit" | "bundleSize" | "totalPaid">,
): Money | null {
  const perUnit = stemsPerUnit(batch.unit, batch.bundleSize);
  if (perUnit === null || batch.quantity <= 0) return null;
  return roundMoney(batch.totalPaid / (batch.quantity * perUnit));
}

/**
 * A receipt line's total paid. Keeps the total written on the receipt; when it
 * is missing, computes quantity × unitPrice, both in the unit written on the
 * receipt. null when the unit, quantity or unit price is unknown: the screen
 * then asks the florist.
 */
export function receiptLineTotal(
  line: Pick<ReceiptDraftLine, "quantity" | "unit" | "unitPrice" | "totalPaid">,
): Money | null {
  if (line.totalPaid !== null) return line.totalPaid;
  if (line.unit === null || line.quantity === null || line.unitPrice === null) return null;
  return roundMoney(line.quantity * line.unitPrice);
}

/** A stock batch with its receipt's purchase date, as latestCost needs it. */
export type DatedBatch = Pick<StockBatch, "stemId" | "costPerStem" | "createdAt"> & {
  purchaseDate: ManilaDate;
};

/**
 * What one stem (one bunch for fillers) costs the shop now: the newest batch by
 * purchase date, ties going to the one entered last; else the sample price.
 * cost is null for a never-bought bundle stem with no bundle size: there is no
 * usable cost, the same as costPerStem.
 */
export function latestCost(
  stem: Pick<Stem, "id" | "unit" | "bundleSize" | "samplePrice">,
  batches: DatedBatch[],
): { cost: Money | null; isSample: boolean } {
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
  const perUnit = stemsPerUnit(stem.unit, stem.bundleSize);
  return { cost: perUnit === null ? null : roundMoney(stem.samplePrice / perUnit), isSample: true };
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
 * Callers pass open quotes only (sent and not expired). A ₱0 price is never
 * underwater: there is no price to update.
 */
export function isUnderwater(
  price: Money,
  recipeCostAtLatest: Money,
  shop: Pick<Shop, "minimumMarginPercent">,
): boolean {
  if (price === 0) return false;
  return margin(price, recipeCostAtLatest) < shop.minimumMarginPercent / 100;
}

/** Rounds down to centavos, trimming float error first as roundMoney does. */
function floorMoney(amount: number): Money {
  return Math.floor(Number((amount * 100).toPrecision(15))) / 100;
}

/**
 * The highest recipe cost whose price fits the budget and still meets the
 * shop's minimum margin; null when none does (the budget is below the fees, or
 * the markup is too low for the minimum margin at every price that fits).
 */
export function maxRecipeCost(
  budget: Money,
  shop: Pick<Shop, "markupPercent" | "wrapFee" | "laborFee" | "minimumMarginPercent">,
): Money | null {
  const fees = shop.wrapFee + shop.laborFee;
  const markup = 1 + shop.markupPercent / 100;
  const keep = 1 - shop.minimumMarginPercent / 100;
  let top = Math.floor(budget / 10) * 10;
  // When the markup alone is below the minimum margin, a price P has a cost that
  // prices at P and keeps the margin only while P < (fees + ₱10) ÷ (1 − keep ×
  // markup), whatever the budget. Starting there, the first price or two check out.
  const shortfall = 1 - keep * markup;
  if (shortfall > 0) top = Math.min(top, Math.ceil((fees + 10) / shortfall / 10) * 10);
  // Prices are whole ₱10s. From the highest price that can work down, take the
  // highest cost at that price, capped by the minimum margin there. A lower price
  // never allows a higher cost, so the first that checks out is the answer. The
  // step limit is only a guard: the answer comes within a few steps.
  for (let level = top, steps = 0; level > fees && steps < 1000; level -= 10, steps++) {
    const cost = Math.min(floorMoney((level - fees) / markup), floorMoney(level * keep));
    const at = price(cost, shop);
    if (cost > 0 && at <= budget && !isUnderwater(at, cost, shop)) return cost;
  }
  return null;
}

/** Count limits from spec decisions 8 and 25. */
export const COUNT_LIMITS = { stemsPerLine: 100, bunchesPerLine: 5, stemsPerBouquet: 200 } as const;

/** A whole count within a line's limits: 1–100 stems, or 1–5 filler bunches. */
export function clampCount(count: number, isFiller: boolean): number {
  const max = isFiller ? COUNT_LIMITS.bunchesPerLine : COUNT_LIMITS.stemsPerLine;
  return Math.min(max, Math.max(1, Math.round(count)));
}

/** A new line's starting count from the AI's count range, within the line limits. */
export function prefillCount(countLow: number, countHigh: number, isFiller: boolean, rule: CountPrefill): number {
  switch (rule) {
    case "middle":
      return clampCount(Math.ceil((countLow + countHigh) / 2), isFiller);
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

  // Multiply before dividing: count × 200 is a whole number, so a line that
  // scales to exactly 125 is not floored to 124 by float error.
  return lines.map((line) =>
    line.isFiller || line.count === null
      ? line
      : { ...line, count: Math.max(1, Math.floor((line.count * COUNT_LIMITS.stemsPerBouquet) / total)) },
  );
}
