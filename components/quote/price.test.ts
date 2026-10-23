import { describe, expect, it } from "vitest";
import { price, recipeCost } from "@/lib/money";
import { priceAtLatest } from "./price";

const shop = { markupPercent: 100, wrapFee: 150, laborFee: 100 };

describe("priceAtLatest (an underwater quote's new price)", () => {
  it("reprices each line at its stem's latest cost, with lib/money's formula", () => {
    const lines = [
      { stemId: "rose", count: 12, costPerStem: 40 },
      { stemId: "baby", count: 2, costPerStem: 60 },
    ];
    const stems = [
      { id: "rose", latestCost: 55 },
      { id: "baby", latestCost: 60 },
    ];
    const expected = price(recipeCost([{ stemId: "rose", count: 12, costPerStem: 55 }, { stemId: "baby", count: 2, costPerStem: 60 }]).cost, shop);
    expect(priceAtLatest(lines, stems, shop)).toBe(expected);
    expect(priceAtLatest(lines, stems, shop)).toBeGreaterThan(price(recipeCost(lines).cost, shop));
  });
  it("keeps a line's own cost when its stem isn't in the list", () => {
    const lines = [{ stemId: "gone", count: 3, costPerStem: 50 }];
    expect(priceAtLatest(lines, [], shop)).toBe(price(150, shop));
  });
});
