// Rules for fitting a quote to the customer's budget. Pure, so budget.test.ts covers them.
import { parseAmount } from "@/components/receipt/lines";
import type { BudgetOption } from "@/lib/contract";
import type { EditLine } from "./QuoteLineRow";

/** The typed budget ("₱2,000" works), or null unless it is a number above 0. */
export function parseBudget(text: string): number | null {
  const budget = parseAmount(text);
  return budget > 0 ? budget : null;
}

/** The route's margin (0–1) as a whole percent; toPrecision drops float noise (0.355 → 36). */
export const marginPercent = (margin: number) => Math.round(Number((margin * 100).toPrecision(12)));

/** "Over budget by ₱X" in whole pesos, rounded up so it never understates. */
export const overBudgetAmount = (amount: number) =>
  Math.ceil(amount).toLocaleString("en-PH", { maximumFractionDigits: 0 });

/**
 * An option's recipe as new editor lines. No ids: PUT …/lines then replaces every line.
 * The florist chose these counts, so each is exact and sure of itself.
 */
export function optionToLines(option: BudgetOption, makeKey: () => string = () => crypto.randomUUID()): EditLine[] {
  return option.lines.map((l) => ({
    key: makeKey(),
    stemId: l.stemId,
    count: l.count,
    countLow: l.count,
    countHigh: l.count,
    confidence: "high",
    note: l.note,
    costPerStem: l.costPerStem,
  }));
}
