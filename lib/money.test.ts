import { describe, expect, test } from "vitest";
import {
  clampBouquet,
  clampCount,
  costPerStem,
  isUnderwater,
  latestCost,
  margin,
  maxRecipeCost,
  prefillCount,
  price,
  receiptLineTotal,
  recipeCost,
} from "./money";

describe("costPerStem", () => {
  test("divides a dozen by 12 stems", () => {
    expect(costPerStem({ quantity: 2, unit: "dozen", bundleSize: null, totalPaid: 300 })).toBe(12.5);
  });

  test("divides per10 by 10 stems", () => {
    expect(costPerStem({ quantity: 1, unit: "per10", bundleSize: null, totalPaid: 120 })).toBe(12);
  });

  test("divides a bundle by its bundle size", () => {
    expect(costPerStem({ quantity: 2, unit: "bundle", bundleSize: 10, totalPaid: 300 })).toBe(15);
  });

  test("prices a filler bunch whole", () => {
    expect(costPerStem({ quantity: 3, unit: "bunch", bundleSize: null, totalPaid: 180 })).toBe(60);
  });

  test("counts a piece as one stem", () => {
    expect(costPerStem({ quantity: 5, unit: "piece", bundleSize: null, totalPaid: 250 })).toBe(50);
  });

  test("keeps two decimals", () => {
    expect(costPerStem({ quantity: 1, unit: "dozen", bundleSize: null, totalPaid: 100 })).toBe(8.33);
  });

  test("is null for a bundle without a bundle size", () => {
    expect(costPerStem({ quantity: 1, unit: "bundle", bundleSize: null, totalPaid: 300 })).toBeNull();
  });

  test("is null for a quantity of zero", () => {
    expect(costPerStem({ quantity: 0, unit: "piece", bundleSize: null, totalPaid: 50 })).toBeNull();
  });
});

describe("latestCost", () => {
  const rose = { id: "rose", unit: "dozen", bundleSize: null, samplePrice: 180 } as const;
  const batch = (purchaseDate: string, createdAt: string, cost: number, stemId = "rose") => ({
    stemId,
    purchaseDate,
    createdAt,
    costPerStem: cost,
  });

  test("uses the batch with the newest purchase date, even if entered earlier", () => {
    const batches = [
      batch("2026-10-20", "2026-10-22T09:00:00Z", 12),
      batch("2026-10-18", "2026-10-22T10:00:00Z", 10),
    ];
    expect(latestCost(rose, batches)).toEqual({ cost: 12, isSample: false });
  });

  test("breaks a purchase-date tie with the batch entered last", () => {
    const batches = [
      batch("2026-10-20", "2026-10-22T10:00:00Z", 14),
      batch("2026-10-20", "2026-10-22T09:00:00Z", 12),
    ];
    expect(latestCost(rose, batches)).toEqual({ cost: 14, isSample: false });
  });

  test("ignores other stems' batches", () => {
    expect(latestCost(rose, [batch("2026-10-20", "2026-10-22T09:00:00Z", 99, "tulip")])).toEqual({
      cost: 15,
      isSample: true,
    });
  });

  test("falls back to the sample price per stem when never bought", () => {
    expect(latestCost(rose, [])).toEqual({ cost: 15, isSample: true });
  });

  test("divides a bundle's sample price by its bundle size", () => {
    const mums = { id: "mums", unit: "bundle", bundleSize: 10, samplePrice: 150 } as const;
    expect(latestCost(mums, [])).toEqual({ cost: 15, isSample: true });
  });

  test("has no usable cost for a bundle stem without a bundle size", () => {
    const mums = { id: "mums", unit: "bundle", bundleSize: null, samplePrice: 150 } as const;
    expect(latestCost(mums, [])).toEqual({ cost: null, isSample: true });
  });
});

describe("recipeCost", () => {
  test("adds stems and filler bunches at their cost", () => {
    const lines = [
      { stemId: "rose", count: 3, costPerStem: 12.5 },
      { stemId: "babys-breath", count: 2, costPerStem: 60 },
    ];
    expect(recipeCost(lines)).toEqual({ cost: 157.5, incomplete: false });
  });

  test("keeps two decimals", () => {
    expect(recipeCost([{ stemId: "rose", count: 3, costPerStem: 8.33 }])).toEqual({
      cost: 24.99,
      incomplete: false,
    });
  });

  test("counts a blank count as zero and marks the recipe incomplete", () => {
    const lines = [
      { stemId: "rose", count: null, costPerStem: 12.5 },
      { stemId: "tulip", count: 2, costPerStem: 40 },
    ];
    expect(recipeCost(lines)).toEqual({ cost: 80, incomplete: true });
  });

  test("counts a pick-a-flower line as zero and marks the recipe incomplete", () => {
    const lines = [
      { stemId: null, count: 3, costPerStem: 50 },
      { stemId: "tulip", count: 2, costPerStem: 40 },
    ];
    expect(recipeCost(lines)).toEqual({ cost: 80, incomplete: true });
  });
});

describe("price", () => {
  const shop = { markupPercent: 50, wrapFee: 50, laborFee: 100 };

  test("marks up the recipe cost, adds fees, and rounds up to the nearest 10 pesos", () => {
    // 157.50 x 1.5 = 236.25, + 50 + 100 = 386.25
    expect(price(157.5, shop)).toBe(390);
  });

  test("does not mark up the fees", () => {
    expect(price(100, { markupPercent: 0, wrapFee: 30, laborFee: 20 })).toBe(150);
  });

  test("keeps an exact multiple of 10 despite float error", () => {
    // 100 x 1.1 is 110.00000000000001 in floating point.
    expect(price(100, { markupPercent: 10, wrapFee: 0, laborFee: 0 })).toBe(110);
  });

  test("rounds up a half centavo over that floating point stores just under", () => {
    // 526.67 x 1.5 is exactly 790.005, stored as 790.0049999...
    expect(price(526.67, { markupPercent: 50, wrapFee: 0, laborFee: 0 })).toBe(800);
  });

  test("rounds up even one centavo over", () => {
    expect(price(100.01, { markupPercent: 0, wrapFee: 0, laborFee: 0 })).toBe(110);
  });
});

describe("margin", () => {
  test("is the share of the price left after the recipe cost", () => {
    expect(margin(400, 300)).toBe(0.25);
  });

  test("is negative when the recipe costs more than the price", () => {
    expect(margin(200, 250)).toBe(-0.25);
  });

  test("is zero for a zero price", () => {
    expect(margin(0, 0)).toBe(0);
  });
});

describe("isUnderwater", () => {
  const shop = { minimumMarginPercent: 20 };

  test("is true when the margin at latest costs is below the minimum", () => {
    expect(isUnderwater(200, 170, shop)).toBe(true);
  });

  test("is false at exactly the minimum margin", () => {
    expect(isUnderwater(350, 280, shop)).toBe(false);
  });

  test("is false above the minimum margin", () => {
    expect(isUnderwater(390, 157.5, shop)).toBe(false);
  });

  test("is false for a quote with a price of 0", () => {
    expect([isUnderwater(0, 0, shop), isUnderwater(0, 50, shop)]).toEqual([false, false]);
  });
});

describe("maxRecipeCost", () => {
  const shop = { markupPercent: 50, wrapFee: 50, laborFee: 100, minimumMarginPercent: 20 };

  /** The answer by trying every cost, centavo by centavo, from the budget down. */
  function bruteForce(budget: number, s: typeof shop): number | null {
    for (let centavos = budget * 100; centavos > 0; centavos--) {
      const cost = centavos / 100;
      const p = price(cost, s);
      if (p <= budget && !isUnderwater(p, cost, s)) return cost;
    }
    return null;
  }

  test("is the highest cost whose price fits the budget: (₱2,000 − ₱150) ÷ 1.5, to the centavo", () => {
    expect(maxRecipeCost(2000, shop)).toBe(1233.33);
    expect(price(1233.33, shop)).toBe(2000);
    expect(price(1233.34, shop)).toBe(2010);
    expect(bruteForce(2000, shop)).toBe(1233.33);
  });

  test("a budget between ₱10 steps fits the price below it", () => {
    expect(maxRecipeCost(2005, shop)).toBe(1233.33);
  });

  test("a low markup is capped by the minimum margin, not the budget", () => {
    const thin = { ...shop, markupPercent: 10 };
    const max = maxRecipeCost(2000, thin);
    expect(max).toBe(bruteForce(2000, thin));
    // The budget alone would allow (₱2,000 − ₱150) ÷ 1.1 = ₱1,681.81.
    expect(max).toBeLessThan(1681.81);
  });

  test("a markup too low for the minimum margin leaves only a tiny cost, from the ₱10 rounding", () => {
    // At 10% markup with no fees, only rounding up to ₱10 gives the 20% margin: ₱64 sells for ₱80.
    const tooLow = { ...shop, markupPercent: 10, wrapFee: 0, laborFee: 0 };
    expect(maxRecipeCost(2000, tooLow)).toBe(64);
    expect(bruteForce(2000, tooLow)).toBe(64);
  });

  test.each([
    ["the budget is below the fees", 100],
    ["the budget only covers the fees", 150],
  ])("is null when %s", (_case, budget) => {
    const s = shop;
    expect(maxRecipeCost(budget, s)).toBeNull();
    expect(bruteForce(budget, s)).toBeNull();
  });
});

describe("clampCount", () => {
  test("keeps a flower line between 1 and 100 stems", () => {
    expect([clampCount(0, false), clampCount(37, false), clampCount(150, false)]).toEqual([1, 37, 100]);
  });

  test("keeps a filler line between 1 and 5 bunches", () => {
    expect([clampCount(0, true), clampCount(3, true), clampCount(8, true)]).toEqual([1, 3, 5]);
  });

  test("rounds to a whole count", () => {
    expect(clampCount(2.6, false)).toBe(3);
  });
});

describe("prefillCount", () => {
  test("starts at the middle of the count range, rounded up", () => {
    expect([
      prefillCount(4, 7, false, "middle"),
      prefillCount(30, 44, false, "middle"),
      prefillCount(3, 3, false, "middle"),
    ]).toEqual([6, 37, 3]);
  });

  test("stays within the line limits", () => {
    expect([prefillCount(4, 7, true, "middle"), prefillCount(120, 160, false, "middle")]).toEqual([5, 100]);
  });
});

describe("clampBouquet", () => {
  const flower = (count: number | null) => ({ count, isFiller: false });
  const filler = (count: number) => ({ count, isFiller: true });

  test("leaves a bouquet of 200 stems or fewer alone", () => {
    expect(clampBouquet([flower(150), flower(50), filler(5)])).toEqual([flower(150), flower(50), filler(5)]);
  });

  test("scales flower lines down to 200 stems, keeping the mix", () => {
    expect(clampBouquet([flower(150), flower(100), filler(5)])).toEqual([flower(120), flower(80), filler(5)]);
  });

  test("keeps whole counts that float division would shave", () => {
    // 145 x (200 / 232) is 124.999... in floating point; 145 x 200 / 232 is exactly 125.
    expect(clampBouquet([flower(145), flower(87)])).toEqual([flower(125), flower(75)]);
  });

  test("never takes a line below 1 stem", () => {
    expect(clampBouquet([flower(100), flower(100), flower(1)])).toEqual([flower(99), flower(99), flower(1)]);
  });

  test("leaves blank counts blank", () => {
    expect(clampBouquet([flower(150), flower(null), flower(100)])).toEqual([flower(120), flower(null), flower(80)]);
  });
});

describe("receiptLineTotal", () => {
  test("keeps the total written on the receipt", () => {
    expect(receiptLineTotal({ quantity: 2, unit: "dozen", unitPrice: 270, totalPaid: 540 })).toBe(540);
  });

  test("computes a missing total as quantity x unit price in the receipt's unit", () => {
    // "Carnation - pink, 20pc @15": 20 pieces at 15 a piece.
    expect(receiptLineTotal({ quantity: 20, unit: "piece", unitPrice: 15, totalPaid: null })).toBe(300);
  });

  test("leaves the total for the florist when the unit is unknown", () => {
    expect(receiptLineTotal({ quantity: 20, unit: null, unitPrice: 15, totalPaid: null })).toBeNull();
  });

  test("leaves the total for the florist when the quantity or unit price is missing", () => {
    expect([
      receiptLineTotal({ quantity: null, unit: "piece", unitPrice: 15, totalPaid: null }),
      receiptLineTotal({ quantity: 20, unit: "piece", unitPrice: null, totalPaid: null }),
    ]).toEqual([null, null]);
  });
});
