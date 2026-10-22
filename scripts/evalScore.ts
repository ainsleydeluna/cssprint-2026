// Scoring for the bake-off (docs/spec.md decision 27 and section 4, C10). Pure:
// no files, no network. scripts/eval.ts reads the photos and answers and calls
// these.

import { bouquetToLines } from "../lib/ai/analyzeBouquet";
import type { AiOutcome } from "../lib/ai/client";
import { findStem } from "../lib/ai/shared";
import { stemName, type AnalyzeBouquetResult, type EvalResult, type ExtractReceiptResult, type StemWithCost } from "../lib/contract";
import { costPerStem, receiptLineTotal } from "../lib/money";
import type { Stem, Unit } from "../lib/types";

export type SeedStem = Pick<Stem, "flower" | "color" | "isFiller" | "unit" | "bundleSize" | "samplePrice">;

/** The seed rows as the shop's visible stems, each priced at its sample price per stem (per bunch for fillers). */
export function pricedStems(rows: SeedStem[]): StemWithCost[] {
  return rows.map((row) => {
    const name = stemName(row);
    const latestCost = costPerStem({ quantity: 1, unit: row.unit, bundleSize: row.bundleSize, totalPaid: row.samplePrice }) ?? 0;
    return { ...row, id: name, shopId: "eval", sampleSource: "", hidden: false, createdAt: "", name, latestCost, isSample: true };
  });
}

/** One photo's hand count. `stem` is the row name, or the closest stem for "Other". */
export type BouquetTruth = { photo: string; lines: Array<{ stem: string; count: number }> };

/**
 * One photo's score. Rows: a hand-counted row the answer also has; out of the
 * hand count's rows or the answer's rows, whichever is more, so extra lines
 * count against it. Counts: the quote's starting count within 2 of the hand
 * count, out of the hand count's rows. Total: the answer's recipe cost within
 * 10% of the hand count's, at sample prices; "unscored" when a hand-counted row
 * has no price.
 */
export type BouquetScore = {
  rowLines: number;
  rightRows: number;
  countLines: number;
  countsWithin2: number;
  total: "within" | "outside" | "unscored";
  seconds: number;
};

const key = (name: string) => name.trim().toLowerCase();

/** Counts per row name, adding up repeated rows. */
function countsByRow(lines: Array<{ stem: string; count: number }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(key(line.stem), (counts.get(key(line.stem)) ?? 0) + line.count);
  return counts;
}

export function scoreBouquet(
  truth: BouquetTruth,
  outcome: AiOutcome<AnalyzeBouquetResult>,
  stems: StemWithCost[],
): BouquetScore {
  // The answer as the quote screen would start it: stemId is the row name here.
  const lines = outcome.ok ? bouquetToLines(outcome.result, stems) : [];
  const answer = countsByRow(lines.map((line) => ({ stem: line.stemId ?? "Other", count: line.count ?? 0 })));
  const wanted = countsByRow(truth.lines);

  let rightRows = 0;
  let countsWithin2 = 0;
  for (const [row, count] of wanted) {
    const answered = answer.get(row);
    if (answered === undefined) continue;
    rightRows++;
    if (Math.abs(answered - count) <= 2) countsWithin2++;
  }

  const cost = (counts: Map<string, number>) => {
    let sum = 0;
    for (const [row, count] of counts) {
      const stem = findStem(stems, row);
      if (!stem) return null;
      sum += count * stem.latestCost;
    }
    return sum;
  };
  const wantedCost = cost(wanted);
  const answerCost = lines.reduce((sum, line) => sum + (line.count ?? 0) * line.costPerStem, 0);
  const total =
    wantedCost === null || wantedCost <= 0
      ? "unscored"
      : Math.abs(answerCost - wantedCost) <= 0.1 * wantedCost
        ? "within"
        : "outside";

  return {
    rowLines: Math.max(wanted.size, answer.size),
    rightRows,
    countLines: wanted.size,
    countsWithin2,
    total,
    seconds: outcome.seconds,
  };
}

/** One receipt's answer key, from fixtures/receipts/receipt_ground_truth_answers.csv. */
export type ReceiptTruth = {
  receipt: string;
  lines: Array<{ stem: string; quantity: number | null; unit: Unit | null; unitPrice: number | null; totalPaid: number | null }>;
};

/**
 * One receipt's score. A line is right when an answer line has its stem, its
 * quantity and its price (the total paid, or quantity × unit price when no
 * total is written). Out of the answer key's lines or the answer's lines,
 * whichever is more, so extra lines count against it.
 */
export type ReceiptScore = { lines: number; rightLines: number; seconds: number };

export function scoreReceipt(truth: ReceiptTruth, outcome: AiOutcome<ExtractReceiptResult>): ReceiptScore {
  const answer = outcome.ok ? [...outcome.result.lines] : [];
  const lines = Math.max(truth.lines.length, answer.length);
  let rightLines = 0;
  for (const wanted of truth.lines) {
    const wantedTotal = receiptLineTotal(wanted);
    const i = answer.findIndex(
      (line) =>
        line.stem !== null &&
        key(line.stem) === key(wanted.stem) &&
        line.quantity === wanted.quantity &&
        sameMoney(receiptLineTotal(line), wantedTotal),
    );
    if (i === -1) continue;
    rightLines++;
    // Each answer line matches one answer-key line at most.
    answer.splice(i, 1);
  }
  return { lines, rightLines, seconds: outcome.seconds };
}

function sameMoney(a: number | null, b: number | null): boolean {
  return a === null || b === null ? a === b : Math.abs(a - b) < 0.005;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const share = (right: number, out: number) => (out === 0 ? 0 : right / out);

/**
 * One run's row of results.json. Lines are pooled across photos. medianSeconds
 * is the slower of the two calls' medians, so under 15 means both are.
 */
export function summarize(model: string, photoPx: number, bouquets: BouquetScore[], receipts: ReceiptScore[]): EvalResult {
  const sum = <T>(items: T[], pick: (item: T) => number) => items.reduce((total, item) => total + pick(item), 0);
  const scored = bouquets.filter((score) => score.total !== "unscored");
  return {
    model,
    photoPx,
    stemRowAccuracy: share(sum(bouquets, (s) => s.rightRows), sum(bouquets, (s) => s.rowLines)),
    countsWithin2: share(sum(bouquets, (s) => s.countsWithin2), sum(bouquets, (s) => s.countLines)),
    totalsWithin10Percent: share(scored.filter((s) => s.total === "within").length, scored.length),
    receiptLineAccuracy: share(sum(receipts, (s) => s.rightLines), sum(receipts, (s) => s.lines)),
    medianSeconds: Math.max(median(bouquets.map((s) => s.seconds)), median(receipts.map((s) => s.seconds))),
  };
}

/** Decision 27's pass marks. */
export function passes(result: EvalResult): boolean {
  return (
    result.stemRowAccuracy >= 0.9 &&
    result.countsWithin2 >= 0.8 &&
    result.totalsWithin10Percent >= 0.8 &&
    result.receiptLineAccuracy >= 0.95 &&
    result.medianSeconds < 15
  );
}

/** The mean of the four shares: how "most accurate" is ranked when no run passes. */
export function accuracy(result: EvalResult): number {
  return (result.stemRowAccuracy + result.countsWithin2 + result.totalsWithin10Percent + result.receiptLineAccuracy) / 4;
}

export type Run = { result: EvalResult; costUsd: number };

/** The cheapest passing run; if none passes, the most accurate. null for no runs. */
export function pickWinner(runs: Run[]): (Run & { passed: boolean }) | null {
  const passing = runs.filter((run) => passes(run.result)).sort((a, b) => a.costUsd - b.costUsd);
  if (passing.length > 0) return { ...passing[0], passed: true };
  const best = [...runs].sort((a, b) => accuracy(b.result) - accuracy(a.result))[0];
  return best ? { ...best, passed: false } : null;
}

/** Rows of a CSV file as objects keyed by the header, with a UTF-8 BOM stripped. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted && c === '"' && src[i + 1] === '"') {
      field += '"';
      i++;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (quoted || (c !== "," && c !== "\n" && c !== "\r")) {
      field += c;
    } else {
      row.push(field);
      field = "";
      if (c === ",") continue;
      if (c === "\r" && src[i + 1] === "\n") i++;
      rows.push(row);
      row = [];
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header = [], ...body] = rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  const names = header.map((name) => name.trim().toLowerCase());
  return body.map((cells) => {
    // A row quoted whole ("photo-07.jpg,Rose - pink,7,...") reads as one field.
    const fixed = cells.length === 1 && names.length > 1 ? cells[0].split(",") : cells;
    return Object.fromEntries(names.map((name, i) => [name, (fixed[i] ?? "").trim()]));
  });
}

/** Bouquet hand counts. A photo with any count of 0 is not counted yet: skipped and listed. */
export function parseLabels(csv: string): { photos: BouquetTruth[]; skipped: string[] } {
  const byPhoto = new Map<string, BouquetTruth["lines"]>();
  const skipped = new Set<string>();
  for (const row of parseCsv(csv)) {
    const count = Number(row.count) || 0;
    if (count <= 0) skipped.add(row.photo);
    const stem = row.stem.toLowerCase() === "other" ? row.closest_stem || "Other" : row.stem;
    byPhoto.set(row.photo, [...(byPhoto.get(row.photo) ?? []), { stem, count }]);
  }
  const photos = [...byPhoto].filter(([photo]) => !skipped.has(photo)).map(([photo, lines]) => ({ photo, lines }));
  return { photos, skipped: [...skipped] };
}

const numberOrNull = (cell: string) => (cell === "" ? null : Number(cell));

export function parseReceiptAnswers(csv: string): ReceiptTruth[] {
  const byReceipt = new Map<string, ReceiptTruth["lines"]>();
  for (const row of parseCsv(csv)) {
    const line = {
      stem: row.stem,
      quantity: numberOrNull(row.quantity),
      unit: (row.unit || null) as Unit | null,
      unitPrice: numberOrNull(row.unit_price),
      totalPaid: numberOrNull(row.total_paid),
    };
    byReceipt.set(row.receipt, [...(byReceipt.get(row.receipt) ?? []), line]);
  }
  return [...byReceipt].map(([receipt, lines]) => ({ receipt, lines }));
}
