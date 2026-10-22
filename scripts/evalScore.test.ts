import { describe, expect, it } from "vitest";
import type { AiOutcome } from "../lib/ai/client";
import type { AnalyzeBouquetResult, EvalResult, ExtractReceiptResult } from "../lib/contract";
import { parseLabels, parseReceiptAnswers, passes, pickWinner, pricedStems, scoreBouquet, scoreReceipt, summarize } from "./evalScore";

// Sample prices: a dozen red roses ₱240 is ₱20 a stem; tulips ₱120 a piece; baby's breath ₱100 a bunch.
const stems = pricedStems([
  { flower: "Rose", color: "red", isFiller: false, unit: "dozen", bundleSize: null, samplePrice: 240 },
  { flower: "Rose", color: "white", isFiller: false, unit: "dozen", bundleSize: null, samplePrice: 240 },
  { flower: "Tulip", color: "pink", isFiller: false, unit: "piece", bundleSize: null, samplePrice: 120 },
  { flower: "Baby's breath", color: "white", isFiller: true, unit: "bunch", bundleSize: null, samplePrice: 100 },
]);

function line(stem: string, countLow: number, countHigh: number, closestStem: string | null = null) {
  return { stem, color: "", countLow, countHigh, confidence: "high" as const, closestStem, note: "" };
}

function bouquet(lines: AnalyzeBouquetResult["lines"], seconds = 8): AiOutcome<AnalyzeBouquetResult> {
  return { ok: true, result: { lines, note: "" }, model: "claude-opus-5-5", seconds, inputTokens: 0, outputTokens: 0 };
}

describe("scoreBouquet", () => {
  it("scores a right answer: every row, every count and the total", () => {
    const truth = { photo: "photo-01.jpg", lines: [{ stem: "Rose - red", count: 12 }, { stem: "Baby's breath - white", count: 2 }] };
    const score = scoreBouquet(truth, bouquet([line("Rose - red", 11, 13), line("Baby's breath - white", 2, 2)]), stems);
    expect(score).toEqual({ rowLines: 2, rightRows: 2, countLines: 2, countsWithin2: 2, total: "within", seconds: 8 });
  });

  it("counts an extra line against rows, and a count 3 off as wrong", () => {
    const truth = { photo: "photo-02.jpg", lines: [{ stem: "Rose - red", count: 12 }] };
    // Truth costs 12 × ₱20 = ₱240; the answer costs 15 × ₱20 + 9 × ₱120 = ₱1,380.
    const score = scoreBouquet(truth, bouquet([line("Rose - red", 15, 15), line("Tulip - pink", 9, 9)]), stems);
    expect(score).toMatchObject({ rowLines: 2, rightRows: 1, countLines: 1, countsWithin2: 0, total: "outside" });
  });

  it("uses the middle of the range, rounded up, as the count", () => {
    const truth = { photo: "photo-03.jpg", lines: [{ stem: "Rose - red", count: 10 }] };
    // Middle of 10–15 is 12.5, rounded up to 13: 3 off.
    expect(scoreBouquet(truth, bouquet([line("Rose - red", 10, 15)]), stems).countsWithin2).toBe(0);
    // Middle of 10–14 is 12: 2 off.
    expect(scoreBouquet(truth, bouquet([line("Rose - red", 10, 14)]), stems).countsWithin2).toBe(1);
  });

  it("matches an Other line by its closest stem, and rows ignore case", () => {
    const truth = { photo: "photo-04.jpg", lines: [{ stem: "tulip - PINK", count: 5 }] };
    const score = scoreBouquet(truth, bouquet([line("Other", 5, 5, "Tulip - pink")]), stems);
    expect(score).toMatchObject({ rightRows: 1, countsWithin2: 1, total: "within" });
  });

  it("adds up an answer's lines for the same row", () => {
    const truth = { photo: "photo-05.jpg", lines: [{ stem: "Rose - red", count: 12 }] };
    const score = scoreBouquet(truth, bouquet([line("Rose - red", 6, 6), line("Rose - red", 6, 6)]), stems);
    expect(score).toMatchObject({ rowLines: 1, rightRows: 1, countsWithin2: 1, total: "within" });
  });

  it("scores a failed call as all wrong but keeps its seconds", () => {
    const truth = { photo: "photo-06.jpg", lines: [{ stem: "Rose - red", count: 12 }] };
    const failed: AiOutcome<AnalyzeBouquetResult> = {
      ok: false,
      error: "Timed out",
      model: "claude-haiku-5-5",
      seconds: 60,
      inputTokens: 0,
      outputTokens: 0,
    };
    expect(scoreBouquet(truth, failed, stems)).toEqual({
      rowLines: 1,
      rightRows: 0,
      countLines: 1,
      countsWithin2: 0,
      total: "outside",
      seconds: 60,
    });
  });

  it("leaves the total unscored when a hand-counted row has no price", () => {
    const truth = { photo: "photo-07.jpg", lines: [{ stem: "Hydrangea - white", count: 4 }] };
    expect(scoreBouquet(truth, bouquet([line("Other", 4, 4, "Rose - white")]), stems).total).toBe("unscored");
  });
});

function receipt(lines: Array<Partial<ExtractReceiptResult["lines"][number]>>, seconds = 5): AiOutcome<ExtractReceiptResult> {
  const full = lines.map((line) => ({
    rawText: "",
    stem: null,
    quantity: null,
    unit: null,
    bundleSize: null,
    unitPrice: null,
    totalPaid: null,
    confidence: "high" as const,
    note: "",
    ...line,
  }));
  return { ok: true, result: { purchaseDate: null, lines: full, note: "" }, model: "claude-sonnet-5-5", seconds, inputTokens: 0, outputTokens: 0 };
}

describe("scoreReceipt", () => {
  const truth = {
    receipt: "receipt-01.1.png",
    lines: [
      { stem: "Rose - red", quantity: 2, unit: "dozen" as const, unitPrice: null, totalPaid: 300 },
      { stem: "Carnation - pink", quantity: 10, unit: "piece" as const, unitPrice: null, totalPaid: 200 },
    ],
  };

  it("needs the stem, quantity and price right on a line", () => {
    const score = scoreReceipt(
      truth,
      receipt([
        { stem: "Rose - red", quantity: 2, unit: "dozen", totalPaid: 300 },
        { stem: "Carnation - pink", quantity: 10, unit: "piece", totalPaid: 250 },
      ]),
    );
    expect(score).toEqual({ lines: 2, rightLines: 1, seconds: 5 });
  });

  it("takes quantity × unit price as the price when no total is written", () => {
    const score = scoreReceipt(
      truth,
      receipt([
        { stem: "Rose - red", quantity: 2, unit: "dozen", unitPrice: 150 },
        { stem: "carnation - PINK", quantity: 10, unit: "piece", totalPaid: 200 },
      ]),
    );
    expect(score.rightLines).toBe(2);
  });

  it("counts extra and unmatched lines against it", () => {
    const score = scoreReceipt(
      truth,
      receipt([
        { stem: "Rose - red", quantity: 2, unit: "dozen", totalPaid: 300 },
        { stem: null, quantity: 10, unit: "piece", totalPaid: 200 },
        { stem: "Rose - red", quantity: 2, unit: "dozen", totalPaid: 300 },
      ]),
    );
    expect(score).toEqual({ lines: 3, rightLines: 1, seconds: 5 });
  });
});

describe("summarize, passes and pickWinner", () => {
  const bouquets = [
    { rowLines: 10, rightRows: 9, countLines: 10, countsWithin2: 8, total: "within" as const, seconds: 9 },
    { rowLines: 10, rightRows: 10, countLines: 10, countsWithin2: 10, total: "within" as const, seconds: 11 },
    { rowLines: 1, rightRows: 1, countLines: 1, countsWithin2: 1, total: "unscored" as const, seconds: 30 },
  ];
  const receipts = [
    { lines: 20, rightLines: 19, seconds: 4 },
    { lines: 20, rightLines: 20, seconds: 6 },
  ];

  it("pools lines across photos and takes the slower call's median seconds", () => {
    expect(summarize("claude-sonnet-5-5", 1600, bouquets, receipts)).toEqual({
      model: "claude-sonnet-5-5",
      photoPx: 1600,
      stemRowAccuracy: 20 / 21,
      countsWithin2: 19 / 21,
      totalsWithin10Percent: 1,
      receiptLineAccuracy: 39 / 40,
      medianSeconds: 11,
    });
  });

  const row = (overrides: Partial<EvalResult>): EvalResult => ({
    model: "claude-opus-5-5",
    photoPx: 1600,
    stemRowAccuracy: 0.9,
    countsWithin2: 0.8,
    totalsWithin10Percent: 0.8,
    receiptLineAccuracy: 0.95,
    medianSeconds: 14.9,
    ...overrides,
  });

  it("passes exactly at the pass marks, and fails at 15 seconds", () => {
    expect(passes(row({}))).toBe(true);
    expect(passes(row({ medianSeconds: 15 }))).toBe(false);
    expect(passes(row({ stemRowAccuracy: 0.89 }))).toBe(false);
    expect(passes(row({ countsWithin2: 0.79 }))).toBe(false);
    expect(passes(row({ totalsWithin10Percent: 0.79 }))).toBe(false);
    expect(passes(row({ receiptLineAccuracy: 0.94 }))).toBe(false);
  });

  it("picks the cheapest passing run", () => {
    const winner = pickWinner([
      { result: row({ model: "claude-opus-5-5" }), costUsd: 0.5 },
      { result: row({ model: "claude-haiku-5-5", stemRowAccuracy: 0.5 }), costUsd: 0.01 },
      { result: row({ model: "claude-sonnet-5-5" }), costUsd: 0.2 },
    ]);
    expect(winner).toMatchObject({ passed: true, result: { model: "claude-sonnet-5-5" } });
  });

  it("picks the most accurate run when none passes", () => {
    const winner = pickWinner([
      { result: row({ model: "claude-haiku-5-5", stemRowAccuracy: 0.5 }), costUsd: 0.01 },
      { result: row({ model: "claude-opus-5-5", stemRowAccuracy: 0.85 }), costUsd: 0.5 },
    ]);
    expect(winner).toMatchObject({ passed: false, result: { model: "claude-opus-5-5" } });
  });
});

describe("parseLabels", () => {
  it("strips the BOM, uses the closest stem for Other, and skips uncounted photos", () => {
    const csv = [
      '﻿"photo","stem","closest_stem","count","is_filler","counted_by","recount","note","source_url"',
      '"photo-01.jpg","Rose - red","","12","false","Ian","","",""',
      '"photo-01.jpg","Other","Tulip - pink","3","false","Ian","","peony",""',
      '"photo-01.jpg","Other","","2","true","Ian","","",""',
      '"photo-02.jpg","Rose - red","","0","false","Ian","","",""',
    ].join("\r\n");
    expect(parseLabels(csv)).toEqual({
      photos: [
        {
          photo: "photo-01.jpg",
          lines: [
            { stem: "Rose - red", count: 12 },
            { stem: "Tulip - pink", count: 3 },
            { stem: "Other", count: 2 },
          ],
        },
      ],
      skipped: ["photo-02.jpg"],
    });
  });

  it("reads columns by name, and a row quoted whole as one field", () => {
    const csv = [
      '"photo","stem","count","is_filler","closest_stem","note","counted_by","source_url"',
      '"photo-07.jpg,Rose - pink,7,false,,,Ian,https://example.com/a"',
    ].join("\n");
    expect(parseLabels(csv).photos).toEqual([{ photo: "photo-07.jpg", lines: [{ stem: "Rose - pink", count: 7 }] }]);
  });
});

describe("parseReceiptAnswers", () => {
  it("groups lines by receipt, with blanks as null", () => {
    const csv = [
      "receipt,stem,quantity,unit,bundle_size,unit_price,total_paid,purchase_date",
      "receipt-01.1.png,Rose - red,2,dozen,,,300,2026-10-23",
      "receipt-01.1.png,Tulip - yellow,2,bundle,10,125,,2026-10-23",
    ].join("\n");
    expect(parseReceiptAnswers(csv)).toEqual([
      {
        receipt: "receipt-01.1.png",
        lines: [
          { stem: "Rose - red", quantity: 2, unit: "dozen", unitPrice: null, totalPaid: 300 },
          { stem: "Tulip - yellow", quantity: 2, unit: "bundle", unitPrice: 125, totalPaid: null },
        ],
      },
    ]);
  });
});
