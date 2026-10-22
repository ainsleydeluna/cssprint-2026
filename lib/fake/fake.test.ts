// The fake data's types are checked by tsc (every file uses `satisfies`).
// These tests check what types cannot: that every fake number follows the
// money rules, so screens built on fakes show numbers the real code would.

import { describe, expect, test } from "vitest";
import { costPerStem, isUnderwater, latestCost, margin, price, receiptLineTotal, recipeCost } from "../money";
import { batches, quotes, receipts, shop, stems } from "./data";
import { budgetOptions, extractReceipt, priceUpdate, quoteList } from "./responses";

const purchaseDate = (receiptId: string) => receipts.find((receipt) => receipt.id === receiptId)!.purchaseDate;
const datedBatches = batches.map((batch) => ({ ...batch, purchaseDate: purchaseDate(batch.receiptId) }));
const latest = (stemId: string) => stems.find((stem) => stem.id === stemId)!.latestCost;

describe("fake data follows the money rules", () => {
  test("each batch's cost per stem", () => {
    for (const batch of batches) expect(batch.costPerStem, batch.id).toBe(costPerStem(batch));
  });

  test("each stem's latest cost and sample label", () => {
    for (const stem of stems) {
      expect({ cost: stem.latestCost, isSample: stem.isSample }, stem.name).toEqual(latestCost(stem, datedBatches));
    }
  });

  test("each extracted receipt line's total and cost per stem", () => {
    for (const line of extractReceipt.lines) {
      // Wherever quantity × unit price can be computed, it matches the total.
      const computed = receiptLineTotal({ ...line, totalPaid: null });
      if (computed !== null) expect(line.totalPaid, line.rawText).toBe(computed);
      expect(line.costPerStem, line.rawText).toBe(costPerStem(line));
    }
  });

  test("each quote's price", () => {
    for (const { quote, lines } of quotes) {
      expect(quote.price, quote.label).toBe(price(recipeCost(lines).cost, shop));
    }
  });

  test("open quotes are flagged underwater exactly when their margin at latest costs is too low", () => {
    for (const { quote, lines } of quotes) {
      if (quote.status !== "sent") continue;
      const atLatest = lines.map((line) => ({ ...line, costPerStem: line.stemId ? latest(line.stemId) : 0 }));
      const underwater = isUnderwater(quote.price!, recipeCost(atLatest).cost, shop);
      expect(quote.underwaterAt !== null, quote.label).toBe(underwater);
    }
  });

  test("the price update quotes the new price at latest costs", () => {
    const { quote, lines } = quotes.find((detail) => detail.quote.underwaterAt !== null)!;
    const atLatest = lines.map((line) => ({ ...line, costPerStem: latest(line.stemId!) }));
    expect([priceUpdate.oldPrice, priceUpdate.newPrice]).toEqual([quote.price, price(recipeCost(atLatest).cost, shop)]);
  });

  test("each budget option's cost, price and margin", () => {
    for (const option of budgetOptions.options) {
      const cost = recipeCost(option.lines).cost;
      expect([option.recipeCost, option.price], option.label).toEqual([cost, price(cost, shop)]);
      expect(option.margin, option.label).toBeCloseTo(margin(option.price, cost), 3);
    }
  });

  test("time-to-quote and the shop's average", () => {
    const seconds = (quote: { createdAt: string; sentAt: string | null }) =>
      quote.sentAt === null ? null : (Date.parse(quote.sentAt) - Date.parse(quote.createdAt)) / 1000;
    for (const item of quoteList.quotes) expect(item.timeToQuoteSeconds, item.label).toBe(seconds(item));
    const sent = quoteList.quotes.flatMap((item) => (item.timeToQuoteSeconds === null ? [] : [item.timeToQuoteSeconds]));
    expect(quoteList.averageTimeToQuoteSeconds).toBe(sent.reduce((a, b) => a + b, 0) / sent.length);
  });
});
