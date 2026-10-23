import { describe, expect, it } from "vitest";
import type { BudgetOption } from "@/lib/contract";
import { t } from "@/lib/strings";
import { emptyOptionsMessage, marginPercent, optionToLines, overBudgetAmount, parseBudget } from "./budget";

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
