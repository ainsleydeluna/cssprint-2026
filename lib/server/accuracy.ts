// The accuracy page's numbers (docs/spec.md section 4, "AI accuracy page"):
// the bake-off results scripts/eval.ts writes, and live numbers from ai_calls
// (decision 13) with cost from the token prices in lib/ai/config.ts.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { CALLS, TOKEN_PRICES, type ModelId } from "../ai/config";
import type { AccuracyResponse, EvalResult } from "../contract";
import type { AiCall, AiCallName } from "../types";

type CallRow = Pick<AiCall, "call" | "model" | "seconds" | "inputTokens" | "outputTokens" | "quoteId">;

/** US dollars; null for a model missing from TOKEN_PRICES, such as one since removed from config. */
function costUsd(row: CallRow): number | null {
  const prices = Object.hasOwn(TOKEN_PRICES, row.model) ? TOKEN_PRICES[row.model as ModelId] : undefined;
  if (!prices) return null;
  return (row.inputTokens * prices.input + row.outputTokens * prices.output) / 1_000_000;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The average of the known values; null when none is known. */
function averageKnown(values: Array<number | null>): number | null {
  const known = values.filter((value) => value !== null);
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0) / known.length;
}

/**
 * Per call name: count, median seconds and average cost. Per quote: the sum of
 * its calls' costs, averaged over quotes. Failed calls count too: they took time
 * and may have used tokens. A call of unknown cost is left out of the cost
 * averages, and so is a quote with one.
 */
export function liveStats(rows: CallRow[]): Pick<AccuracyResponse, "live" | "averageCostPerQuoteUsd"> {
  const live = (Object.keys(CALLS) as AiCallName[]).flatMap((call) => {
    const calls = rows.filter((row) => row.call === call);
    if (calls.length === 0) return [];
    return [{ call, calls: calls.length, medianSeconds: median(calls.map((row) => row.seconds)), averageCostUsd: averageKnown(calls.map(costUsd)) }];
  });

  const perQuote = new Map<string, number | null>();
  for (const row of rows) {
    if (row.quoteId === null) continue;
    const sum = perQuote.has(row.quoteId) ? perQuote.get(row.quoteId)! : 0;
    const cost = costUsd(row);
    perQuote.set(row.quoteId, sum === null || cost === null ? null : sum + cost);
  }
  return { live, averageCostPerQuoteUsd: averageKnown([...perQuote.values()]) };
}

/** fixtures/eval/results.json; empty until scripts/eval.ts writes it, or when it cannot be read. */
export async function readEvalResults(): Promise<EvalResult[]> {
  let text: string;
  try {
    text = await readFile(path.join(process.cwd(), "fixtures/eval/results.json"), "utf8");
  } catch {
    return [];
  }
  try {
    const results: unknown = JSON.parse(text);
    if (Array.isArray(results)) return results as EvalResult[];
    console.error("fixtures/eval/results.json is not a list");
  } catch {
    console.error("fixtures/eval/results.json is not valid JSON");
  }
  return [];
}
