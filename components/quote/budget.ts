// Rules for fitting a quote to the customer's budget. Pure, so budget.test.ts covers them.
import { parseAmount } from "@/components/receipt/lines";
import type { BudgetOption } from "@/lib/contract";
import { t } from "@/lib/strings";
import { peso } from "./format";
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
 * What to say when the route answers no options. Fit to budget only makes cheaper versions,
 * so a quote already at or under the budget gets none: say it fits, with the room left
 * (rounded down, so it never promises more). Over budget with no options: none was found.
 */
export function emptyOptionsMessage(price: number, budget: number): string {
  if (price > budget) return t("quote", "noOptions");
  return `${t("quote", "fitsBudget")} ${t("quote", "roomLeft", { price: peso(Math.floor(budget - price)) })}`;
}

/**
 * The line above the cards when the only one is the over-budget fallback (the route found
 * nothing within budget and minimum margin): "Walang option na pasok sa ₱2,000. Ito ang
 * pinakamalapit:". The budget shows as typed, centavos and all.
 */
export function fallbackNote(options: Pick<BudgetOption, "overBudgetBy">[], budget: number): string | null {
  if (options.length !== 1 || !(options[0].overBudgetBy > 0)) return null;
  const digits = Number.isInteger(budget) ? 0 : 2;
  return t("quote", "closestOnly", {
    budget: budget.toLocaleString("en-PH", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  });
}

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
