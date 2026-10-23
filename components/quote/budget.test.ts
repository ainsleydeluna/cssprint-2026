import { describe, expect, it } from "vitest";
import type { BudgetOption } from "@/lib/contract";
import { t } from "@/lib/strings";
import type { StemWithCost } from "@/lib/contract";
import {
  emptyOptionsMessage,
  fallbackNote,
  marginPercent,
  optionRecipe,
  optionToLines,
  overBudgetAmount,
  parseBudget,
  recipeKey,
} from "./budget";
import type { EditLine } from "./QuoteLineRow";

describe("parseBudget", () => {
  it("accepts ₱, commas and spaces", () => {
    expect(parseBudget("₱2,000")).toBe(2000);
    expect(parseBudget(" 1500 ")).toBe(1500);
    expect(parseBudget("₱ 2,499.50")).toBe(2499.5);
  });
  it("is null for blank, zero, negative or not a number", () => {
    for (const text of ["", "  ", "₱", "0", "-500", "abc", "1.2.3"]) expect(parseBudget(text)).toBeNull();
  });
});

describe("marginPercent", () => {
  it("shows the route's 0–1 margin as a whole percent", () => {
    expect(marginPercent(0.4237)).toBe(42);
    expect(marginPercent(0.355)).toBe(36);
    expect(marginPercent(0)).toBe(0);
  });
});

describe("overBudgetAmount", () => {
  it("is whole pesos, rounded up so it never understates", () => {
    expect(overBudgetAmount(280)).toBe("280");
    expect(overBudgetAmount(1280)).toBe("1,280");
    expect(overBudgetAmount(279.5)).toBe("280");
  });
});

describe("optionToLines", () => {
  const option: BudgetOption = {
    label: "Fewer roses",
    lines: [
      { stemId: "rose", count: 9, costPerStem: 45, note: "" },
      { stemId: "baby", count: 2, costPerStem: 60, note: "filler" },
    ],
    recipeCost: 525,
    price: 1890,
    margin: 0.42,
    overBudgetBy: 0,
  };

  it("makes new editor lines: no id, exact count, sure of itself", () => {
    let n = 0;
    const lines = optionToLines(option, () => `k${++n}`);
    expect(lines).toEqual([
      { key: "k1", stemId: "rose", count: 9, countLow: 9, countHigh: 9, confidence: "high", note: "", costPerStem: 45 },
      { key: "k2", stemId: "baby", count: 2, countLow: 2, countHigh: 2, confidence: "high", note: "filler", costPerStem: 60 },
    ]);
    expect(lines.every((l) => !("id" in l))).toBe(true);
  });
});

describe("emptyOptionsMessage (the route answered no options)", () => {
  it("says the quote already fits, with the room left in whole pesos", () => {
    expect(emptyOptionsMessage(1460, 2000)).toBe(`${t("quote", "fitsBudget")} ${t("quote", "roomLeft", { price: "₱540" })}`);
  });
  it("counts a price exactly at the budget as fitting, with ₱0 left", () => {
    expect(emptyOptionsMessage(2000, 2000)).toBe(`${t("quote", "fitsBudget")} ${t("quote", "roomLeft", { price: "₱0" })}`);
  });
  it("rounds the room down, so it never promises more than there is", () => {
    expect(emptyOptionsMessage(1460, 2000.75)).toContain("₱540");
  });
  it("keeps 'no option found' when the quote is over budget", () => {
    expect(emptyOptionsMessage(2340, 2000)).toBe(t("quote", "noOptions"));
  });
});

describe("fallbackNote (above the over-budget fallback card)", () => {
  const card = (overBudgetBy: number) => ({ label: "Fewer roses", lines: [], recipeCost: 700, price: 2280, margin: 0.4, overBudgetBy });

  it("shows when the only card is the over-budget fallback, with the budget", () => {
    expect(fallbackNote([card(280)], 2000)).toBe(t("quote", "closestOnly", { budget: "2,000" }));
  });
  it("keeps the centavos of a budget that has them", () => {
    expect(fallbackNote([card(280)], 2499.5)).toBe(t("quote", "closestOnly", { budget: "2,499.50" }));
  });
  it("is null when the cards fit the budget, or there are none", () => {
    expect(fallbackNote([card(0)], 2000)).toBeNull();
    expect(fallbackNote([card(0), card(0)], 2000)).toBeNull();
    expect(fallbackNote([], 2000)).toBeNull();
  });
});

describe("parseBudget: the server's money limit", () => {
  it("accepts up to ₱99,999,999.99 (numeric(10,2), like the route)", () => {
    expect(parseBudget("₱99,999,999.99")).toBe(99999999.99);
  });
  it("refuses anything above it, so the button stays off", () => {
    expect(parseBudget("100,000,000")).toBeNull();
    expect(parseBudget("99999999.999")).toBeNull();
  });
});

describe("recipeKey (old options go stale once the recipe changes)", () => {
  const l = (key: string, patch: Partial<EditLine> = {}): EditLine => ({
    key, stemId: "rose", count: 12, countLow: 10, countHigh: 14, confidence: "high", note: "", costPerStem: 45, ...patch,
  });
  const lines = [l("a", { id: "1" }), l("b", { id: "2", stemId: "baby", count: 2 })];

  it("stays the same when nothing about the recipe changed (a save only adds ids and costs)", () => {
    expect(recipeKey([l("x"), l("y", { stemId: "baby", count: 2 })])).toBe(recipeKey(lines));
    expect(recipeKey(lines.map((x) => ({ ...x, costPerStem: 50 })))).toBe(recipeKey(lines));
  });
  it("changes on any edit: a count, a flower, a note, a line added or removed", () => {
    const before = recipeKey(lines);
    expect(recipeKey([l("a", { count: 13 }), lines[1]])).not.toBe(before);
    expect(recipeKey([l("a", { stemId: "tulip" }), lines[1]])).not.toBe(before);
    expect(recipeKey([l("a", { note: "lighter pink" }), lines[1]])).not.toBe(before);
    expect(recipeKey([lines[0]])).not.toBe(before);
    expect(recipeKey([...lines, l("c")])).not.toBe(before);
  });
});

describe("optionRecipe (the flowers on an option's card)", () => {
  const stems = [
    { id: "rose", flower: "Rose", color: "red" },
    { id: "lily", flower: "Stargazer lily", color: "pink" },
  ] as StemWithCost[];

  it("lists each line as count × stem name", () => {
    const option = { lines: [{ stemId: "rose", count: 12 }, { stemId: "lily", count: 4 }] };
    expect(optionRecipe(option, stems)).toBe("12 × Rose - red · 4 × Stargazer lily - pink");
  });
  it("falls back to the row id for a stem the list doesn't have", () => {
    expect(optionRecipe({ lines: [{ stemId: "gone", count: 3 }] }, stems)).toBe("3 × gone");
  });
});
