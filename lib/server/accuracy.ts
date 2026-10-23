// The accuracy page's numbers (docs/spec.md section 4, "AI accuracy page"):
// the bake-off results scripts/eval.ts writes, and live numbers from ai_calls
// (decision 13) with cost from the token prices in lib/ai/config.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
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

/** Per call name, how many calls the shop has made: one count query each, so no row cap applies. */
export async function countCalls(supabase: SupabaseClient): Promise<CallCounts> {
  const names = Object.keys(CALLS) as AiCallName[];
  const counts = await Promise.all(
    names.map(async (call) => {
      const { count, error } = await supabase.from("ai_calls").select("*", { count: "exact", head: true }).eq("call", call);
      if (error) throw new Error(`Counting AI calls failed: ${error.message}`);
      return [call, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts);
}

export type CallCounts = Partial<Record<AiCallName, number>>;

/**
 * Per call name: count, median seconds and average cost. Per quote: the sum of
 * its calls' costs, averaged over quotes. Failed calls count too: they took time
 * and may have used tokens. A call of unknown cost is left out of the cost
 * averages, and so is a quote with one.
 *
 * Every call name is listed. Its count comes from `counts` (countCalls), which
 * covers all of the shop's calls; without it, the rows are counted. Medians,
 * costs and cost per quote cover only `rows`, the latest 1,000 calls the route
 * reads, so a name with no calls among them has a null median and cost.
 */
export function liveStats(rows: CallRow[], counts: CallCounts = {}): Pick<AccuracyResponse, "live" | "averageCostPerQuoteUsd"> {
  const live = (Object.keys(CALLS) as AiCallName[]).map((call) => {
    const calls = rows.filter((row) => row.call === call);
    return {
      call,
      calls: counts[call] ?? calls.length,
      medianSeconds: calls.length === 0 ? null : median(calls.map((row) => row.seconds)),
      averageCostUsd: averageKnown(calls.map(costUsd)),
    };
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

const isNumber = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

/** One row as EvalResult, or null when a field is missing or out of range. Shares are 0 to 1. */
function evalRow(value: unknown): EvalResult | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const shares = [row.stemRowAccuracy, row.countsWithin2, row.totalsWithin10Percent, row.receiptLineAccuracy];
  if (typeof row.model !== "string" || row.model === "") return null;
  if (!isNumber(row.photoPx, 1, Infinity) || !isNumber(row.medianSeconds, 0, Infinity)) return null;
  if (!shares.every((share) => isNumber(share, 0, 1))) return null;
  return {
    model: row.model,
    photoPx: row.photoPx as number,
    stemRowAccuracy: row.stemRowAccuracy as number,
    countsWithin2: row.countsWithin2 as number,
    totalsWithin10Percent: row.totalsWithin10Percent as number,
    receiptLineAccuracy: row.receiptLineAccuracy as number,
    medianSeconds: row.medianSeconds as number,
  };
}

/** The well-formed rows of results.json; malformed rows are skipped, and anything but a list gives none. */
export function parseEvalResults(json: unknown): EvalResult[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((value) => {
    const row = evalRow(value);
    return row ? [row] : [];
  });
}

/** fixtures/eval/results.json; empty until scripts/eval.ts writes it, or when it cannot be read. */
export async function readEvalResults(): Promise<EvalResult[]> {
  let text: string;
  try {
    text = await readFile(path.join(process.cwd(), "fixtures/eval/results.json"), "utf8");
  } catch {
    return [];
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("fixtures/eval/results.json is not valid JSON");
    return [];
  }
  const results = parseEvalResults(json);
  if (!Array.isArray(json) || results.length < json.length) console.error("fixtures/eval/results.json has malformed rows; skipped them");
  return results;
}
