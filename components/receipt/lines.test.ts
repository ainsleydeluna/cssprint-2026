import { describe, expect, it } from "vitest";
import type { StemWithCost } from "@/lib/contract";
import { type DraftLine, isMatched, lineProblems, parseAmount, sampleFromLine, toInput } from "./lines";

const stem = (id: string, hidden = false) => ({ id, hidden }) as StemWithCost;
const stems = [stem("rose"), stem("sunflower", true)];
const line = (patch: Partial<DraftLine> = {}): DraftLine => ({
  key: "1", rawText: "", stemId: "rose", quantity: "2", unit: "dozen", bundleSize: "",
  totalPaid: "540", unitPrice: 270, confidence: "high", note: "", edited: false, ...patch,
});

describe("parseAmount (fix 2)", () => {
  it("strips ₱, commas and spaces", () => {
    expect(parseAmount("1,200")).toBe(1200);
    expect(parseAmount("₱540")).toBe(540);
    expect(parseAmount(" ₱ 1,234.50 ")).toBe(1234.5);
  });
  it("is NaN for blank or non-numbers", () => {
    expect(parseAmount("")).toBeNaN();
    expect(parseAmount("  ")).toBeNaN();
    expect(parseAmount("₱")).toBeNaN();
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("1.2.3")).toBeNaN();
  });
});

describe("sampleFromLine (fix 1)", () => {
  it("is total paid ÷ quantity, in the line's current unit, to two decimals", () => {
    expect(sampleFromLine(line({ quantity: "2", totalPaid: "540" }))).toBe(270);
    expect(sampleFromLine(line({ quantity: "3", totalPaid: "10" }))).toBe(3.33);
    expect(sampleFromLine(line({ quantity: "3", totalPaid: "20" }))).toBe(6.67);
    expect(sampleFromLine(line({ quantity: "12", totalPaid: "₱1,200" }))).toBe(100);
  });
  it("ignores the receipt's unit price after a unit change (piece → dozen)", () => {
    // "20pc @15" re-read by the florist as 2 dozen for ₱300: ₱150 a dozen, not ₱15.
    expect(sampleFromLine(line({ unit: "dozen", quantity: "2", totalPaid: "300", unitPrice: 15 }))).toBe(150);
  });
  it("is 0 when the total or quantity is missing or quantity is 0", () => {
    expect(sampleFromLine(line({ totalPaid: "" }))).toBe(0);
    expect(sampleFromLine(line({ quantity: "" }))).toBe(0);
    expect(sampleFromLine(line({ quantity: "0" }))).toBe(0);
    expect(sampleFromLine(line({ totalPaid: "abc" }))).toBe(0);
  });
});

describe("isMatched (fix 4)", () => {
  it("needs a stem that exists and isn't hidden", () => {
    expect(isMatched("rose", stems)).toBe(true);
    expect(isMatched("sunflower", stems)).toBe(false);
    expect(isMatched("gone", stems)).toBe(false);
    expect(isMatched(null, stems)).toBe(false);
  });
});

describe("lineProblems and toInput (fixes 2 and 4)", () => {
  it("accepts ₱ and commas in number fields", () => {
    expect(lineProblems(line({ quantity: "1,000", totalPaid: "₱12,000" }), stems).size).toBe(0);
    expect(toInput(line({ quantity: "1,000", totalPaid: "₱12,000" }), stems)).toEqual({
      stemId: "rose", quantity: 1000, unit: "dozen", bundleSize: null, totalPaid: 12000,
    });
  });
  it("names each invalid field", () => {
    expect([...lineProblems(line({ quantity: "0", totalPaid: "", unit: "" }), stems)].sort()).toEqual(["quantity", "totalPaid", "unit"]);
    expect([...lineProblems(line({ unit: "bundle", bundleSize: "2.5" }), stems)]).toEqual(["bundleSize"]);
    expect(lineProblems(line({ unit: "bundle", bundleSize: "10" }), stems).size).toBe(0);
  });
  it("treats a line matched to a hidden stem as unmatched", () => {
    expect([...lineProblems(line({ stemId: "sunflower" }), stems)]).toEqual(["stem"]);
    expect(toInput(line({ stemId: "sunflower" }), stems)).toBeNull();
  });
});
