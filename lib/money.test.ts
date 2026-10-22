import { describe, expect, test } from "vitest";
import {
  clampBouquet,
  clampCount,
  costPerStem,
  isUnderwater,
  latestCost,
  margin,
  prefillCount,
  price,
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
    expect([prefillCount(4, 7, "middle"), prefillCount(30, 44, "middle"), prefillCount(3, 3, "middle")]).toEqual([
      6, 37, 3,
    ]);
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

  test("never takes a line below 1 stem", () => {
    expect(clampBouquet([flower(100), flower(100), flower(1)])).toEqual([flower(99), flower(99), flower(1)]);
  });

  test("leaves blank counts blank", () => {
    expect(clampBouquet([flower(150), flower(null), flower(100)])).toEqual([flower(120), flower(null), flower(80)]);
  });
});
