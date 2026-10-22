import { describe, expect, test } from "vitest";
import type { ExtractReceiptResult, StemWithCost } from "../contract";
import { todayInManila, toReceiptDraft } from "./receipts";

const row = (id: string, flower: string, color: string, hidden = false): StemWithCost => ({
  id,
  shopId: "shop",
  flower,
  color,
  name: `${flower} - ${color}`,
  isFiller: false,
  unit: "dozen",
  bundleSize: null,
  samplePrice: 250,
  sampleSource: "",
  hidden,
  latestCost: 20.83,
  isSample: true,
});
const stems = [row("rose", "Rose", "red"), row("tulip", "Tulip", "pink", true)];

type Line = ExtractReceiptResult["lines"][number];
const line = (overrides: Partial<Line>): Line => ({
  rawText: "2 dz red rose @270 = 540",
  stem: "Rose - red",
  quantity: 2,
  unit: "dozen",
  bundleSize: null,
  unitPrice: 270,
  totalPaid: 540,
  confidence: "high",
  note: "",
  ...overrides,
});
const draft = (lines: Line[], purchaseDate: string | null = "2026-10-21") =>
  toReceiptDraft({ purchaseDate, lines, note: "" }, stems, "2026-10-23");

describe("todayInManila", () => {
  test("is the Manila calendar date, eight hours ahead of UTC", () => {
    expect(todayInManila(new Date("2026-10-22T15:59:59Z"))).toBe("2026-10-22");
    expect(todayInManila(new Date("2026-10-22T16:00:00Z"))).toBe("2026-10-23");
  });
});

describe("toReceiptDraft", () => {
  test("matches the row name to its stem id and computes the cost per stem", () => {
    expect(draft([line({})]).lines[0]).toMatchObject({ stemId: "rose", totalPaid: 540, costPerStem: 22.5 });
  });

  test("computes a missing total from quantity × unit price", () => {
    expect(draft([line({ totalPaid: null, quantity: 20, unit: "piece", unitPrice: 15 })]).lines[0]).toMatchObject({
      totalPaid: 300,
      costPerStem: 15,
    });
  });

  test("leaves total and cost blank when the unit is unknown, so the screen asks", () => {
    expect(draft([line({ totalPaid: null, unit: null })]).lines[0]).toMatchObject({ totalPaid: null, costPerStem: null });
  });

  test("leaves a line unmatched when its name is not a visible row", () => {
    expect(draft([line({ stem: "Tulip - pink" }), line({ stem: null })]).lines.map((l) => l.stemId)).toEqual([null, null]);
  });

  test("uses today in Manila when the AI could not read a date", () => {
    expect(draft([], null).purchaseDate).toBe("2026-10-23");
  });
});
