// The accuracy page's live numbers from ai_calls (docs/spec.md section 4, "AI
// accuracy page", decision 13). Token prices from lib/ai/config.ts: Opus 5.5 $4
// in and $20 out per million tokens, Sonnet 5.5 $2 and $10.

import { describe, expect, test } from "vitest";
import { liveStats, parseEvalResults } from "./accuracy";

const opus = (seconds: number, inputTokens: number, outputTokens: number, quoteId: string | null = null) =>
  ({ call: "analyzeBouquet", model: "claude-opus-5-5", seconds, inputTokens, outputTokens, quoteId }) as const;
const sonnet = (call: "draftReply" | "extractReceipt", seconds: number, quoteId: string | null = null) =>
  // 500 in and 100 out: $0.001 + $0.001.
  ({ call, model: "claude-sonnet-5-5", seconds, inputTokens: 500, outputTokens: 100, quoteId }) as const;

/** A call name with no calls among the rows read. */
const none = (call: string, calls = 0) => ({ call, calls, medianSeconds: null, averageCostUsd: null });

describe("liveStats", () => {
  test("gives each call name its count, median seconds and average cost, in the pipeline's order", () => {
    // Opus: 1,500 in + 400 out = $0.006 + $0.008 = $0.014; 1,000 in + 200 out = $0.004 + $0.004 = $0.008.
    const rows = [sonnet("draftReply", 2), opus(4, 1500, 400), sonnet("draftReply", 9), opus(10, 1000, 200), sonnet("draftReply", 3)];
    expect(liveStats(rows).live).toEqual([
      { call: "analyzeBouquet", calls: 2, medianSeconds: 7, averageCostUsd: expect.closeTo(0.011, 9) },
      none("extractReceipt"),
      none("fitToBudget"),
      { call: "draftReply", calls: 3, medianSeconds: 3, averageCostUsd: expect.closeTo(0.002, 9) },
      none("priceUpdate"),
    ]);
  });

  test("takes each call name's count from the count query, not from the rows read", () => {
    const rows = [opus(4, 1500, 400), opus(10, 1000, 200), sonnet("draftReply", 3)];
    expect(liveStats(rows, { analyzeBouquet: 1500, draftReply: 1 }).live).toEqual([
      { call: "analyzeBouquet", calls: 1500, medianSeconds: 7, averageCostUsd: expect.closeTo(0.011, 9) },
      none("extractReceipt"),
      none("fitToBudget"),
      { call: "draftReply", calls: 1, medianSeconds: 3, averageCostUsd: expect.closeTo(0.002, 9) },
      none("priceUpdate"),
    ]);
  });

  test("lists all five call names: one with calls, but none among the rows read, has its count and null median and cost", () => {
    const rows = [opus(4, 1500, 400)];
    expect(liveStats(rows, { analyzeBouquet: 1, extractReceipt: 40, fitToBudget: 0, draftReply: 0, priceUpdate: 0 }).live).toEqual([
      { call: "analyzeBouquet", calls: 1, medianSeconds: 4, averageCostUsd: expect.closeTo(0.014, 9) },
      none("extractReceipt", 40),
      none("fitToBudget"),
      none("draftReply"),
      none("priceUpdate"),
    ]);
  });

  test("a quote costs the sum of its calls; receipt calls belong to no quote", () => {
    // Quote q1: $0.014 + $0.002 = $0.016. Quote q2: $0.008. Average $0.012.
    const rows = [opus(4, 1500, 400, "q1"), sonnet("draftReply", 2, "q1"), opus(5, 1000, 200, "q2"), sonnet("extractReceipt", 6)];
    expect(liveStats(rows).averageCostPerQuoteUsd).toBeCloseTo(0.012, 9);
  });

  test("a model missing from the token prices has an unknown cost, left out of the averages", () => {
    const unknown = { ...opus(8, 1000, 200, "q2"), model: "claude-retired-1" };
    const rows = [opus(4, 1500, 400, "q1"), unknown];
    const { live, averageCostPerQuoteUsd } = liveStats(rows);
    expect(live[0]).toEqual({ call: "analyzeBouquet", calls: 2, medianSeconds: 6, averageCostUsd: expect.closeTo(0.014, 9) });
    expect(averageCostPerQuoteUsd).toBeCloseTo(0.014, 9);
  });

  test("costs are null when no call's model has a price", () => {
    const rows = [{ ...opus(8, 1000, 200, "q1"), model: "claude-retired-1" }];
    const { live, averageCostPerQuoteUsd } = liveStats(rows);
    expect(live[0]).toEqual({ call: "analyzeBouquet", calls: 1, medianSeconds: 8, averageCostUsd: null });
    expect(averageCostPerQuoteUsd).toBeNull();
  });

  test("no calls yet: every call name at 0, and no cost per quote", () => {
    expect(liveStats([])).toEqual({
      live: ["analyzeBouquet", "extractReceipt", "fitToBudget", "draftReply", "priceUpdate"].map((call) => none(call)),
      averageCostPerQuoteUsd: null,
    });
  });
});

describe("parseEvalResults", () => {
  const row = {
    model: "claude-sonnet-5-5",
    photoPx: 1600,
    stemRowAccuracy: 0.92,
    countsWithin2: 0.85,
    totalsWithin10Percent: 0.8,
    receiptLineAccuracy: 0.97,
    medianSeconds: 6.4,
  };

  test("keeps well-formed rows, with only the fields the page shows", () => {
    expect(parseEvalResults([{ ...row, notes: "first run" }])).toEqual([row]);
  });

  test.each([
    ["a missing field", { ...row, medianSeconds: undefined }],
    ["a model that is not text", { ...row, model: 5 }],
    ["an empty model", { ...row, model: "" }],
    ["a share as text", { ...row, countsWithin2: "85%" }],
    ["a share above 1", { ...row, stemRowAccuracy: 92 }],
    ["a negative median", { ...row, medianSeconds: -1 }],
    ["a photo size of 0", { ...row, photoPx: 0 }],
    ["a row that is not an object", "claude-sonnet-5-5"],
    ["null", null],
  ])("skips a row with %s and keeps the rest", (_case, bad) => {
    expect(parseEvalResults([bad, row])).toEqual([row]);
  });

  test("answers no rows when the file is not a list", () => {
    expect(parseEvalResults({ results: [row] })).toEqual([]);
  });
});
