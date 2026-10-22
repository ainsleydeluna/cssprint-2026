// Pricing rules for fit to budget and the price update (docs/spec.md section 4,
// "Fit to budget" and "Margin alarm"). Pure: no database, no network. All money
// math is lib/money.ts.

import { pesos } from "../ai/shared";
import type { ApplyPriceUpdateRequest, BudgetOption, FitToBudgetResult, StemWithCost } from "../contract";
import { isUnderwater, margin, price, recipeCost } from "../money";
import type { ManilaDate, Money, Quote, QuoteLine, Shop } from "../types";
import { manilaToday, validUntilOnSend } from "./quote-rules";

/**
 * Prices each fitToBudget option at latest costs, matching rows by exact name.
 * An option naming a row that is not in `stems` is dropped.
 */
export function priceBudgetOptions(
  options: FitToBudgetResult["options"],
  stems: Pick<StemWithCost, "id" | "name" | "latestCost">[],
  shop: Pick<Shop, "markupPercent" | "wrapFee" | "laborFee" | "minimumMarginPercent">,
  budget: Money,
): BudgetOption[] {
  const byName = new Map(stems.map((stem) => [stem.name, stem]));
  const priced = options.flatMap((option) => {
    // An option naming a row the shop does not have cannot be priced.
    if (option.lines.some((line) => !byName.has(line.stem))) return [];
    const lines = option.lines.map((line) => {
      const stem = byName.get(line.stem)!;
      return { stemId: stem.id, count: line.count, costPerStem: stem.latestCost, note: line.note };
    });
    const cost = recipeCost(lines).cost;
    const optionPrice = price(cost, shop);
    return [{ label: option.label, lines, recipeCost: cost, price: optionPrice, margin: margin(optionPrice, cost), overBudgetBy: 0 }];
  });
  // The same minimum-margin test as the margin alarm.
  const fits = priced.filter((option) => option.price <= budget && !isUnderwater(option.price, option.recipeCost, shop));
  if (fits.length > 0 || priced.length === 0) return fits;

  // None fit: show the cheapest, labeled "Over budget by ₱X" on screen. It is 0
  // when the cheapest is within budget but below the minimum margin.
  const cheapest = priced.reduce((best, option) => (option.price < best.price ? option : best));
  return [{ ...cheapest, overBudgetBy: Math.max(0, Math.round((cheapest.price - budget) * 100) / 100) }];
}

type PricedShop = Pick<Shop, "markupPercent" | "wrapFee" | "laborFee" | "validForDays">;

/**
 * What the price update offers an underwater quote: its old price, the same
 * formula at latest costs (`costs`, by stem id), and valid-until reset to the
 * shop's default from today in Manila. Refused unless the quote is open and
 * underwater.
 */
export function priceUpdateTerms(
  quote: Pick<Quote, "status" | "price" | "underwaterAt">,
  lines: Pick<QuoteLine, "stemId" | "count">[],
  costs: Map<string, Money>,
  shop: PricedShop,
  now: Date,
): { ok: true; oldPrice: Money; newPrice: Money; validUntil: ManilaDate } | { ok: false } {
  // A sent quote always has a price (quotes_sent_complete).
  if (quote.status !== "sent" || quote.underwaterAt === null || quote.price === null) return { ok: false };
  const atLatest = lines.map((line) => ({ ...line, costPerStem: line.stemId === null ? 0 : (costs.get(line.stemId) ?? 0) }));
  return {
    ok: true,
    oldPrice: quote.price,
    newPrice: price(recipeCost(atLatest).cost, shop),
    validUntil: validUntilOnSend(null, manilaToday(now), shop.validForDays),
  };
}

/**
 * What copying the price update changes: the draft's price, valid-until date
 * and message (as the reply text), saved exactly as the customer was told. The
 * flag is cleared only if the saved price keeps the minimum margin at latest
 * costs. The sent time and status stay, so time-to-quote does not change.
 */
export function priceUpdateChanges(
  quote: Pick<Quote, "status" | "price" | "validUntil" | "replyText" | "underwaterAt">,
  lines: Pick<QuoteLine, "stemId" | "count">[],
  costs: Map<string, Money>,
  shop: Pick<Shop, "minimumMarginPercent">,
  draft: ApplyPriceUpdateRequest,
  now: Date,
): { ok: true; changes: Partial<Quote> } | { ok: false; error: string } {
  if (quote.status !== "sent") return { ok: false, error: "Only an open quote gets a price update" };
  const repeat = quote.price === draft.newPrice && quote.validUntil === draft.validUntil && quote.replyText === draft.message;
  // A second copy of the same draft, after the first cleared the flag.
  if (repeat && quote.underwaterAt === null) return { ok: true, changes: {} };
  if (quote.underwaterAt === null) return { ok: false, error: "Only an underwater quote gets a price update" };
  if (!draft.message.includes(pesos(draft.newPrice))) return { ok: false, error: "The message must contain the new price" };
  if (draft.validUntil < manilaToday(now)) return { ok: false, error: "validUntil is before today in Manila" };

  const atLatest = lines.map((line) => ({ ...line, costPerStem: line.stemId === null ? 0 : (costs.get(line.stemId) ?? 0) }));
  const stillUnderwater = isUnderwater(draft.newPrice, recipeCost(atLatest).cost, shop);
  return {
    ok: true,
    changes: {
      price: draft.newPrice,
      validUntil: draft.validUntil,
      replyText: draft.message,
      underwaterAt: stillUnderwater ? quote.underwaterAt : null,
    },
  };
}
