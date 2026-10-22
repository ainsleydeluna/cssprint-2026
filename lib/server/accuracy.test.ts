// The accuracy page's live numbers from ai_calls (docs/spec.md section 4, "AI
// accuracy page", decision 13). Token prices from lib/ai/config.ts: Opus 5.5 $4
// in and $20 out per million tokens, Sonnet 5.5 $2 and $10.

import { describe, expect, test } from "vitest";
import { liveStats } from "./accuracy";

const opus = (seconds: number, inputTokens: number, outputTokens: number, quoteId: string | null = null) =>
  ({ call: "analyzeBouquet", model: "claude-opus-5-5", seconds, inputTokens, outputTokens, quoteId }) as const;
const sonnet = (call: "draftReply" | "extractReceipt", seconds: number, quoteId: string | null = null) =>
  // 500 in and 100 out: $0.001 + $0.001.
  ({ call, model: "claude-sonnet-5-5", seconds, inputTokens: 500, outputTokens: 100, quoteId }) as const;

describe("liveStats", () => {
  test("gives each call name its count, median seconds and average cost, in the pipeline's order", () => {
    // Opus: 1,500 in + 400 out = $0.006 + $0.008 = $0.014; 1,000 in + 200 out = $0.004 + $0.004 = $0.008.
    const rows = [sonnet("draftReply", 2), opus(4, 1500, 400), sonnet("draftReply", 9), opus(10, 1000, 200), sonnet("draftReply", 3)];
    expect(liveStats(rows).live).toEqual([
      { call: "analyzeBouquet", calls: 2, medianSeconds: 7, averageCostUsd: expect.closeTo(0.011, 9) },
      { call: "draftReply", calls: 3, medianSeconds: 3, averageCostUsd: expect.closeTo(0.002, 9) },
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
    expect(liveStats(rows)).toEqual({
      live: [{ call: "analyzeBouquet", calls: 2, medianSeconds: 6, averageCostUsd: expect.closeTo(0.014, 9) }],
      averageCostPerQuoteUsd: expect.closeTo(0.014, 9),
    });
  });

  test("costs are null when no call's model has a price", () => {
    const rows = [{ ...opus(8, 1000, 200, "q1"), model: "claude-retired-1" }];
    expect(liveStats(rows)).toEqual({
      live: [{ call: "analyzeBouquet", calls: 1, medianSeconds: 8, averageCostUsd: null }],
      averageCostPerQuoteUsd: null,
    });
  });

  test("no calls yet: no live rows and no cost per quote", () => {
    expect(liveStats([])).toEqual({ live: [], averageCostPerQuoteUsd: null });
  });
});
