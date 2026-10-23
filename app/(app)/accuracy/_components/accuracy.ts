// What the accuracy page shows (docs/spec.md decision 27 and section 4, "AI accuracy page"):
// the bake-off pass marks, which model is in use, and number formats. Pure: no fetch, no React.

import type { EvalResult } from "@/lib/contract";

export type Measure = Exclude<keyof EvalResult, "model" | "photoPx">;

/** Decision 27's pass marks: shares at least `min`, seconds under `under`. */
export const PASS_MARKS = {
  stemRowAccuracy: { min: 0.9 },
  countsWithin2: { min: 0.8 },
  totalsWithin10Percent: { min: 0.8 },
  receiptLineAccuracy: { min: 0.95 },
  medianSeconds: { under: 15 },
} as const satisfies Record<Measure, { min: number } | { under: number }>;

export function meetsMark(measure: Measure, value: number): boolean {
  const mark = PASS_MARKS[measure];
  return "min" in mark ? value >= mark.min : value < mark.under;
}

/** The two AI calls the bake-off tests, and the measures each must meet. */
export const TESTED_CALLS = {
  analyzeBouquet: ["stemRowAccuracy", "countsWithin2", "totalsWithin10Percent", "medianSeconds"],
  extractReceipt: ["receiptLineAccuracy", "medianSeconds"],
} as const satisfies Record<string, readonly Measure[]>;

export type TestedCall = keyof typeof TESTED_CALLS;

/** Whether one bake-off row meets every pass mark for the call. */
export function passes(call: TestedCall, row: EvalResult): boolean {
  return TESTED_CALLS[call].every((measure) => meetsMark(measure, row[measure]));
}

/**
 * How the model in use (lib/ai/config.ts) did in the bake-off at the photo size in use.
 * "nonePassed": it missed, and so did every other row, so decision 27 keeps the most accurate.
 */
export function verdict(
  call: TestedCall,
  results: EvalResult[],
  inUse: Pick<EvalResult, "model" | "photoPx">,
): "untested" | "passed" | "failed" | "nonePassed" {
  const own = results.find((row) => row.model === inUse.model && row.photoPx === inUse.photoPx);
  if (!own) return "untested";
  if (passes(call, own)) return "passed";
  return results.some((row) => passes(call, row)) ? "failed" : "nonePassed";
}

/**
 * A share (0 to 1) as a whole percent, rounded down so a share just under a pass
 * mark never shows as the mark itself. Trimming float error first keeps 0.29 at 29%.
 */
export function percent(share: number): string {
  return `${Math.floor(Number((share * 100).toPrecision(12)))}%`;
}

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** `format(value)`, or "—" when the value is unknown (null). */
export const orDash = (value: number | null, format: (value: number) => string) =>
  value === null ? "—" : format(value);

/** US dollars, with up to four decimals since one call costs a cent or two; "—" when unknown. */
export const usd = (amount: number | null) => orDash(amount, (n) => dollars.format(n));
