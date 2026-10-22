// Run rules for scripts/eval.ts: when a run may replace results.json, and the
// worker pool. Pure: no files, no network.

import type { BouquetScore, ReceiptScore } from "./evalScore";

export type Coverage = {
  /** --limit, --model or --px was given. */
  limited: boolean;
  /** Listed in labels.csv or the receipt answer key, with no photo file. */
  missingPhotos: string[];
  /** A photo file sharp could not decode. */
  unreadable: string[];
  /** A bouquet with a count of 0: answered and saved, but not scored. */
  uncounted: string[];
  /** --rescore found no saved answer, as "<model>/<px>/<photo>". */
  missingAnswers: string[];
  runs: Array<{ model: string; photoPx: number; bouquets: BouquetScore[]; receipts: ReceiptScore[] }>;
};

/**
 * What a run left out. Empty means the run covered every model, size and photo,
 * so it may replace results.json; anything else writes results-partial.json.
 */
export function missingParts(coverage: Coverage): string[] {
  const parts: string[] = [];
  const list = (label: string, items: string[]) => {
    if (items.length) parts.push(`${label}: ${items.join(", ")}`);
  };
  if (coverage.limited) parts.push("limited by --limit, --model or --px");
  list("photo files missing", coverage.missingPhotos);
  list("could not read", coverage.unreadable);
  list("not counted yet", coverage.uncounted);
  list("answers not saved", coverage.missingAnswers);
  if (coverage.runs.length === 0) parts.push("nothing scored");
  for (const run of coverage.runs) {
    const name = `${run.model} at ${run.photoPx} px`;
    if (run.bouquets.length === 0) parts.push(`${name}: no bouquets scored`);
    if (run.receipts.length === 0) parts.push(`${name}: no receipts scored`);
    if (run.bouquets.length > 0 && run.bouquets.every((score) => score.total === "unscored")) {
      parts.push(`${name}: no totals scored`);
    }
  }
  return parts;
}

/**
 * Runs `work` over the items, `size` at a time. At the first failure it rejects
 * at once and no worker starts another item; items already running finish on
 * their own.
 */
export async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < items.length) {
      try {
        await work(items[next++]);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}
