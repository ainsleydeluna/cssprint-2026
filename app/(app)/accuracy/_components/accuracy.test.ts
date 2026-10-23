import { describe, expect, it } from "vitest";
import type { EvalResult } from "@/lib/contract";
import { meetsMark, orDash, passes, percent, usd, verdict } from "./accuracy";

const row: EvalResult = {
  model: "claude-opus-5-5",
  photoPx: 1600,
  stemRowAccuracy: 0.9,
  countsWithin2: 0.8,
  totalsWithin10Percent: 0.8,
  receiptLineAccuracy: 0.95,
  medianSeconds: 14.9,
};

describe("meetsMark (decision 27)", () => {
  it("passes a share exactly at its mark", () => {
    expect(meetsMark("stemRowAccuracy", 0.9)).toBe(true);
    expect(meetsMark("countsWithin2", 0.8)).toBe(true);
    expect(meetsMark("totalsWithin10Percent", 0.8)).toBe(true);
    expect(meetsMark("receiptLineAccuracy", 0.95)).toBe(true);
  });

  it("fails a share just under its mark", () => {
    expect(meetsMark("stemRowAccuracy", 0.89)).toBe(false);
    expect(meetsMark("receiptLineAccuracy", 0.949)).toBe(false);
  });

  it("needs median seconds under 15, not at 15", () => {
    expect(meetsMark("medianSeconds", 14.9)).toBe(true);
    expect(meetsMark("medianSeconds", 15)).toBe(false);
  });
});

describe("passes", () => {
  it("passes the bouquet test on its three marks and speed, ignoring the receipt mark", () => {
    expect(passes("analyzeBouquet", { ...row, receiptLineAccuracy: 0 })).toBe(true);
    expect(passes("analyzeBouquet", { ...row, totalsWithin10Percent: 0.79 })).toBe(false);
    expect(passes("analyzeBouquet", { ...row, medianSeconds: 20 })).toBe(false);
  });

  it("passes the receipt test on its line mark and speed, ignoring the bouquet marks", () => {
    expect(passes("extractReceipt", { ...row, stemRowAccuracy: 0 })).toBe(true);
    expect(passes("extractReceipt", { ...row, receiptLineAccuracy: 0.9 })).toBe(false);
    expect(passes("extractReceipt", { ...row, medianSeconds: 15 })).toBe(false);
  });
});

describe("percent", () => {
  it("shows a share as a whole percent", () => {
    expect(percent(0.93)).toBe("93%");
    expect(percent(1)).toBe("100%");
    expect(percent(0)).toBe("0%");
  });

  it("rounds down, so a share just under a pass mark never shows as the mark", () => {
    expect(percent(0.899)).toBe("89%");
    expect(percent(0.9499)).toBe("94%");
  });
});

describe("verdict for the model in use", () => {
  const inUse = { model: "claude-opus-5-5", photoPx: 1600 };
  const sonnet = { ...row, model: "claude-sonnet-5-5" };
  const failing = { ...row, stemRowAccuracy: 0.5 };

  it("is untested until the bake-off has a row for the model at the photo size in use", () => {
    expect(verdict("analyzeBouquet", [], inUse)).toBe("untested");
    expect(verdict("analyzeBouquet", [{ ...row, photoPx: 1280 }], inUse)).toBe("untested");
  });

  it("is passed when that row meets the call's marks", () => {
    expect(verdict("analyzeBouquet", [row, { ...sonnet, stemRowAccuracy: 0 }], inUse)).toBe("passed");
  });

  it("is failed when that row misses but another row passes", () => {
    expect(verdict("analyzeBouquet", [failing, sonnet], inUse)).toBe("failed");
  });

  it("is nonePassed when no row passes, so the page says the most accurate is used", () => {
    expect(verdict("analyzeBouquet", [failing, { ...sonnet, countsWithin2: 0.1 }], inUse)).toBe("nonePassed");
  });
});

describe("usd", () => {
  it("shows an unknown cost as a dash", () => {
    expect(usd(null)).toBe("—");
  });

  it("shows cents, and up to four decimals for the small cost of one call", () => {
    expect(usd(0.5)).toBe("$0.50");
    expect(usd(0.0123)).toBe("$0.0123");
    expect(usd(0.012345)).toBe("$0.0123");
    expect(usd(1.2)).toBe("$1.20");
  });
});

describe("orDash", () => {
  it("shows an unknown number as a dash, and formats a known one", () => {
    expect(orDash(null, (n) => `${n} s`)).toBe("—");
    expect(orDash(0, (n) => `${n} s`)).toBe("0 s");
  });
});
